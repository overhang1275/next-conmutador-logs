use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
    routing::get,
};
use chrono::{Local, NaiveDate};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    io::{self, Write},
    net::IpAddr,
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::TcpStream,
};
use tokio::sync::watch;

const CONFIG_FILE: &str = "config.toml";
const API_ADDRESS: &str = "127.0.0.1:8787";

#[derive(Clone, Serialize, Deserialize)]
struct Settings {
    pbx_ip: String,
    pbx_port: u16,
    smdr_password: String,
    database_path: String,
    #[serde(default)]
    menu_did: String,
    #[serde(default)]
    menu_areas: Vec<MenuAreaConfig>,
    #[serde(default)]
    api_token: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct MenuAreaConfig {
    key: u8,
    area: String,
    extension: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct MenuConfig {
    menu_did: String,
    menu_areas: Vec<MenuAreaConfig>,
}

#[derive(Clone)]
struct AppState {
    settings: Arc<Mutex<Settings>>,
    settings_write: Arc<Mutex<()>>,
    db: Arc<Mutex<Connection>>,
    status: Arc<Mutex<String>>,
    connected: Arc<AtomicBool>,
    settings_changed: watch::Sender<u64>,
}

#[derive(Deserialize)]
struct DashboardQuery {
    days: Option<i64>,
    page: Option<usize>,
    per_page: Option<usize>,
    q: Option<String>,
    extension: Option<String>,
    did: Option<String>,
    direction: Option<String>,
    result: Option<String>,
}

#[derive(Serialize)]
struct Dashboard {
    status: ServiceStatus,
    summary: Summary,
    daily: Vec<DailyTotal>,
    extensions: Vec<ExtensionTotal>,
    dids: Vec<DidTotal>,
    menu_did: String,
    menu_areas: Vec<MenuAreaTotal>,
    calls: Vec<CallRecord>,
    pagination: Pagination,
}

#[derive(Serialize)]
struct Pagination {
    page: usize,
    per_page: usize,
    total: usize,
    total_pages: usize,
}

#[derive(Serialize)]
struct DidTotal {
    number: String,
    incoming: usize,
}

#[derive(Serialize)]
struct MenuAreaTotal {
    key: u8,
    area: String,
    extension: String,
    incoming: usize,
    answered: usize,
    missed: usize,
    other: usize,
}

#[derive(Deserialize)]
struct UpdateSettings {
    pbx_ip: String,
    pbx_port: u16,
    database_path: String,
    #[serde(default)]
    smdr_password: Option<String>,
}

#[derive(Serialize)]
struct PublicSettings {
    pbx_ip: String,
    pbx_port: u16,
    database_path: String,
    password_configured: bool,
}

#[derive(Serialize)]
struct UpdateSettingsResult {
    settings: PublicSettings,
    reconnecting: bool,
    database_copied: bool,
}

#[derive(Serialize)]
struct ServiceStatus {
    connected: bool,
    message: String,
    pbx_ip: String,
    pbx_port: u16,
    last_record_at: Option<String>,
}

#[derive(Serialize)]
struct Summary {
    total: usize,
    incoming: usize,
    answered: usize,
    missed: usize,
    outgoing: usize,
    active_extensions: usize,
}

#[derive(Serialize)]
struct DailyTotal {
    date: String,
    incoming: usize,
    outgoing: usize,
    missed: usize,
}

#[derive(Serialize)]
struct ExtensionTotal {
    extension: String,
    incoming: usize,
    answered: usize,
    missed: usize,
}

#[derive(Clone, Serialize)]
struct CallRecord {
    id: i64,
    call_date: String,
    call_time: String,
    received_at: String,
    extension: String,
    direction: String,
    caller: String,
    destination: String,
    ring: String,
    duration: String,
    condition: String,
    result: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let settings = load_settings()?;
    let db = open_database(&settings.database_path)?;
    let (settings_changed, _) = watch::channel(0_u64);
    let state = AppState {
        settings: Arc::new(Mutex::new(settings)),
        settings_write: Arc::new(Mutex::new(())),
        db: Arc::new(Mutex::new(db)),
        status: Arc::new(Mutex::new("Iniciando conexión al conmutador…".into())),
        connected: Arc::new(AtomicBool::new(false)),
        settings_changed,
    };
    tokio::spawn(collector_loop(state.clone()));

    let api = Router::new()
        .route("/api/v1/dashboard", get(dashboard))
        .route("/api/v1/export.csv", get(export_csv))
        .route("/api/v1/settings", get(get_settings).put(update_settings))
        .route("/api/v1/menu-config", get(get_menu_config).put(update_menu_config))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(API_ADDRESS).await?;
    println!("Recolector SMDR API disponible en http://{API_ADDRESS}");
    axum::serve(listener, api).await?;
    Ok(())
}

fn load_settings() -> Result<Settings, Box<dyn std::error::Error>> {
    let mut settings: Settings = match fs::read_to_string(CONFIG_FILE) {
        Ok(contents) => toml::from_str(&contents)?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Err(format!(
                "No existe {CONFIG_FILE}; conserva tu archivo de configuración previo."
            )
            .into());
        }
        Err(error) => return Err(error.into()),
    };
    if settings.api_token.is_empty() {
        settings.api_token = std::env::var("SMDR_API_TOKEN").unwrap_or_default();
    }
    if settings.api_token.is_empty() {
        return Err("Configura SMDR_API_TOKEN o api_token antes de iniciar la API.".into());
    }
    fs::write(CONFIG_FILE, toml::to_string_pretty(&settings)?)?;
    Ok(settings)
}

fn open_database(path: &str) -> Result<Connection, Box<dyn std::error::Error>> {
    let db_path = Path::new(path);
    if let Some(parent) = db_path.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent)?;
    }
    let connection = Connection::open(db_path)?;
    connection.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS smdr_records (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             received_at TEXT NOT NULL,
             raw_line TEXT NOT NULL
         );",
    )?;
    Ok(connection)
}

async fn collector_loop(state: AppState) {
    let mut settings_rx = state.settings_changed.subscribe();
    loop {
        let settings = state.settings.lock().unwrap().clone();
        if settings.smdr_password.is_empty() {
            set_status(&state, "Falta configurar la contraseña SMDR.");
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(5)) => {},
                _ = settings_rx.changed() => {},
            }
            continue;
        }
        let address = format!("{}:{}", settings.pbx_ip, settings.pbx_port);
        set_status(&state, &format!("Conectando a {address}…"));
        match TcpStream::connect(&address).await {
            Ok(stream) => {
                state.connected.store(true, Ordering::Relaxed);
                set_status(
                    &state,
                    &format!("Conectado a {address}; esperando registros…"),
                );
                tokio::select! {
                    result = receive_records(stream, &settings, &state) => {
                        if let Err(error) = result {
                            set_status(&state, &format!("Conexión cerrada: {error}"));
                        }
                    },
                    _ = settings_rx.changed() => {
                        set_status(&state, "Configuración actualizada; reconectando con el conmutador…");
                    }
                }
            }
            Err(error) => set_status(&state, &format!("No se pudo conectar a {address}: {error}")),
        }
        state.connected.store(false, Ordering::Relaxed);
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(5)) => {},
            _ = settings_rx.changed() => {},
        }
    }
}

async fn receive_records(
    stream: TcpStream,
    settings: &Settings,
    state: &AppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (read_half, mut write_half) = stream.into_split();
    write_half.write_all(b"SMDR\r\n").await?;
    tokio::time::sleep(Duration::from_millis(250)).await;
    write_half
        .write_all(format!("{}\r\n", settings.smdr_password).as_bytes())
        .await?;

    let mut reader = BufReader::new(read_half);
    let mut line = String::new();
    loop {
        line.clear();
        let bytes = reader.read_line(&mut line).await?;
        if bytes == 0 {
            return Err("el conmutador cerró la sesión".into());
        }
        let clean = line.trim_matches(['\r', '\n', '\0', ' ']);
        if clean.is_empty() || clean.to_ascii_lowercase().contains("password") {
            continue;
        }
        let received_at = Local::now().to_rfc3339();
        state.db.lock().unwrap().execute(
            "INSERT INTO smdr_records (received_at, raw_line) VALUES (?1, ?2)",
            params![received_at, clean],
        )?;
        set_status(state, "Recibiendo registros SMDR");
    }
}

async fn dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DashboardQuery>,
) -> impl IntoResponse {
    if !authorized(&headers, &state) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    if query.direction.as_deref().is_some_and(|value| !["Entrante", "Saliente", "Interna"].contains(&value))
        || query.result.as_deref().is_some_and(|value| !["Atendida", "Sin respuesta", "Recibida", "Estado no indicado", "Completada"].contains(&value))
    {
        return (StatusCode::BAD_REQUEST, "Filtro de dirección o resultado no válido.").into_response();
    }
    match build_dashboard(&state, query) {
        Ok(data) => Json(data).into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error).into_response(),
    }
}

async fn get_settings(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if !authorized(&headers, &state) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    Json(public_settings(&state.settings.lock().unwrap())).into_response()
}

async fn get_menu_config(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if !authorized(&headers, &state) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let settings = state.settings.lock().unwrap();
    Json(MenuConfig {
        menu_did: settings.menu_did.clone(),
        menu_areas: settings.menu_areas.clone(),
    })
    .into_response()
}

async fn update_menu_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(update): Json<MenuConfig>,
) -> impl IntoResponse {
    if !authorized(&headers, &state) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }

    let menu_config = match validate_menu_config(update) {
        Ok(config) => config,
        Err(error) => return (StatusCode::BAD_REQUEST, error).into_response(),
    };

    let _settings_write = state.settings_write.lock().unwrap();
    let mut settings = state.settings.lock().unwrap();
    let mut candidate = (*settings).clone();
    candidate.menu_did = menu_config.menu_did.clone();
    candidate.menu_areas = menu_config.menu_areas.clone();
    if let Err(error) = persist_settings(&candidate) {
        return (StatusCode::INTERNAL_SERVER_ERROR, error).into_response();
    }
    *settings = candidate;

    Json(menu_config).into_response()
}

fn validate_menu_config(mut config: MenuConfig) -> Result<MenuConfig, String> {
    config.menu_did = config.menu_did.trim().to_string();
    if config.menu_did.len() > 32 || !config.menu_did.bytes().all(|digit| digit.is_ascii_digit()) {
        return Err("El DDI principal debe contener solo dígitos y no exceder 32 caracteres.".into());
    }
    if config.menu_did.is_empty() && !config.menu_areas.is_empty() {
        return Err("Configura el DDI principal antes de agregar áreas del menú.".into());
    }

    let mut keys = HashSet::new();
    for area in &mut config.menu_areas {
        area.area = area.area.trim().to_string();
        area.extension = area.extension.trim().to_string();
        if area.key > 9 {
            return Err("La tecla debe estar entre 0 y 9.".into());
        }
        if !keys.insert(area.key) {
            return Err(format!("La tecla {} está repetida.", area.key));
        }
        if area.area.is_empty() {
            return Err(format!("Escribe el nombre del área para la tecla {}.", area.key));
        }
        if area.area.chars().count() > 80 {
            return Err(format!("El nombre del área para la tecla {} excede 80 caracteres.", area.key));
        }
        if area.extension.is_empty() {
            return Err(format!("Escribe la extensión para la tecla {}.", area.key));
        }
        if area.extension.chars().count() > 32 {
            return Err(format!("La extensión para la tecla {} excede 32 caracteres.", area.key));
        }
    }

    Ok(config)
}

async fn update_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(update): Json<UpdateSettings>,
) -> impl IntoResponse {
    if !authorized(&headers, &state) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }

    let pbx_ip = update.pbx_ip.trim().to_string();
    if pbx_ip.parse::<IpAddr>().is_err() {
        return (StatusCode::BAD_REQUEST, "La IP del PBX no es válida.").into_response();
    }
    if update.pbx_port == 0 {
        return (StatusCode::BAD_REQUEST, "El puerto SMDR debe estar entre 1 y 65535.").into_response();
    }
    let database_path = update.database_path.trim().to_string();
    if database_path.is_empty() || database_path.len() > 1024 {
        return (StatusCode::BAD_REQUEST, "La ruta de SQLite está vacía o excede 1024 caracteres.").into_response();
    }
    if update.smdr_password.as_ref().is_some_and(|password| password.len() > 128) {
        return (StatusCode::BAD_REQUEST, "La contraseña SMDR excede 128 caracteres.").into_response();
    }

    let _settings_write = state.settings_write.lock().unwrap();
    let mut settings = state.settings.lock().unwrap();
    let mut candidate = (*settings).clone();
    candidate.pbx_ip = pbx_ip;
    candidate.pbx_port = update.pbx_port;
    if let Some(password) = update.smdr_password.filter(|password| !password.is_empty()) {
        candidate.smdr_password = password;
    }

    let mut new_database = None;
    let old_database_path = candidate.database_path.clone();
    if database_path != old_database_path {
        match prepare_database_change(&state, &old_database_path, &database_path) {
            Ok(connection) => new_database = Some(connection),
            Err(error) => return (StatusCode::BAD_REQUEST, error).into_response(),
        }
        candidate.database_path = database_path.clone();
    }

    if let Err(error) = persist_settings(&candidate) {
        if new_database.is_some() {
            let _ = fs::remove_file(&database_path);
        }
        return (StatusCode::INTERNAL_SERVER_ERROR, error).into_response();
    }
    if let Some(connection) = new_database {
        *state.db.lock().unwrap() = connection;
    }
    *settings = candidate.clone();
    state.settings_changed.send_modify(|revision| *revision = revision.wrapping_add(1));

    Json(UpdateSettingsResult {
        settings: public_settings(&candidate),
        reconnecting: true,
        database_copied: candidate.database_path != old_database_path,
    }).into_response()
}

fn public_settings(settings: &Settings) -> PublicSettings {
    PublicSettings {
        pbx_ip: settings.pbx_ip.clone(),
        pbx_port: settings.pbx_port,
        database_path: settings.database_path.clone(),
        password_configured: !settings.smdr_password.is_empty(),
    }
}

fn prepare_database_change(
    state: &AppState,
    old_path: &str,
    new_path: &str,
) -> Result<Connection, String> {
    if Path::new(new_path).exists() {
        return Err("Ya existe un archivo en la nueva ruta. Elige una ruta que no exista para evitar sobrescribir datos.".into());
    }
    if let Some(parent) = Path::new(new_path).parent().filter(|parent| !parent.as_os_str().is_empty()) {
        fs::create_dir_all(parent).map_err(|error| format!("No se pudo crear la carpeta de destino: {error}"))?;
    }
    let current = state.db.lock().unwrap();
    current
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|error| format!("No se pudo preparar la base actual: {error}"))?;
    fs::copy(old_path, new_path).map_err(|error| format!("No se pudo copiar la base SQLite: {error}"))?;
    match open_database(new_path) {
        Ok(connection) => Ok(connection),
        Err(error) => {
            let _ = fs::remove_file(new_path);
            Err(format!("No se pudo abrir la base copiada: {error}"))
        }
    }
}

fn persist_settings(settings: &Settings) -> Result<(), String> {
    let serialized = toml::to_string_pretty(settings)
        .map_err(|error| format!("No se pudo serializar la configuración: {error}"))?;
    let temp_path = format!("{CONFIG_FILE}.tmp");
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut temp_file = options
        .open(&temp_path)
        .map_err(|error| format!("No se pudo abrir el archivo temporal de configuración: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        temp_file
            .set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("No se pudieron proteger los permisos de configuración: {error}"))?;
    }
    temp_file
        .set_len(0)
        .map_err(|error| format!("No se pudo limpiar el archivo temporal de configuración: {error}"))?;
    temp_file
        .write_all(serialized.as_bytes())
        .and_then(|()| temp_file.sync_all())
        .map_err(|error| format!("No se pudo guardar el archivo temporal de configuración: {error}"))?;

    let backup_stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let backup_path = format!("{CONFIG_FILE}.backup-{backup_stamp}");
    let had_previous = Path::new(CONFIG_FILE).exists();
    if had_previous {
        fs::rename(CONFIG_FILE, &backup_path)
            .map_err(|error| format!("No se pudo conservar la configuración anterior: {error}"))?;
    }
    if let Err(error) = fs::rename(&temp_path, CONFIG_FILE) {
        if had_previous {
            let _ = fs::rename(&backup_path, CONFIG_FILE);
        }
        let _ = fs::remove_file(&temp_path);
        return Err(format!("No se pudo activar la nueva configuración: {error}"));
    }
    Ok(())
}

fn build_dashboard(state: &AppState, query: DashboardQuery) -> Result<Dashboard, String> {
    let status = state.status.lock().unwrap().clone();
    let settings = state.settings.lock().unwrap().clone();
    let db = state.db.lock().unwrap();
    let last_record_at: Option<String> = db
        .query_row("SELECT MAX(received_at) FROM smdr_records", [], |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())?;
    let mut statement = db
        .prepare("SELECT id, received_at, raw_line FROM smdr_records ORDER BY id DESC")
        .map_err(|error| error.to_string())?;
    let stored = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    drop(statement);
    drop(db);

    let days = query.days.unwrap_or(7).clamp(1, 90);
    let today = Local::now().date_naive();
    let first_day = today - chrono::Duration::days(days - 1);
    let parsed = stored
        .iter()
        .filter_map(|(id, received_at, raw)| parse_call(*id, received_at, raw))
        .filter(|call| {
            NaiveDate::parse_from_str(&call.call_date, "%Y-%m-%d")
                .is_ok_and(|date| date >= first_day && date <= today)
        })
        .collect::<Vec<_>>();

    let mut summary = Summary {
        total: parsed.len(),
        incoming: 0,
        answered: 0,
        missed: 0,
        outgoing: 0,
        active_extensions: 0,
    };
    let mut daily: BTreeMap<String, DailyTotal> = BTreeMap::new();
    let mut extensions: HashMap<String, ExtensionTotal> = HashMap::new();
    let mut dids: HashMap<String, usize> = HashMap::new();
    let mut menu_areas = settings.menu_areas.iter().map(|area| MenuAreaTotal {
        key: area.key,
        area: area.area.clone(),
        extension: area.extension.clone(),
        incoming: 0,
        answered: 0,
        missed: 0,
        other: 0,
    })
    .collect::<Vec<_>>();
    for call in &parsed {
        let daily_row = daily.entry(call.call_date.clone()).or_insert(DailyTotal {
            date: call.call_date.clone(),
            incoming: 0,
            outgoing: 0,
            missed: 0,
        });
        if !settings.menu_did.is_empty()
            && call.direction == "Entrante"
            && call.destination == settings.menu_did
        {
            if let Some(area) = menu_areas
                .iter_mut()
                .find(|area| area.extension.as_str() == call.extension.as_str())
            {
                area.incoming += 1;
                match call.result.as_str() {
                    "Atendida" => area.answered += 1,
                    "Sin respuesta" => area.missed += 1,
                    _ => area.other += 1,
                }
            }
        }
        match call.direction.as_str() {
            "Entrante" => {
                summary.incoming += 1;
                daily_row.incoming += 1;
                if !call.destination.is_empty() && call.destination != "Línea principal" {
                    *dids.entry(call.destination.clone()).or_default() += 1;
                }
                if !call.extension.is_empty() {
                    let extension =
                        extensions
                            .entry(call.extension.clone())
                            .or_insert(ExtensionTotal {
                                extension: call.extension.clone(),
                                incoming: 0,
                                answered: 0,
                                missed: 0,
                            });
                    extension.incoming += 1;
                    match call.result.as_str() {
                        "Atendida" => {
                            summary.answered += 1;
                            extension.answered += 1;
                        }
                        "Sin respuesta" => {
                            summary.missed += 1;
                            daily_row.missed += 1;
                            extension.missed += 1;
                        }
                        _ => {}
                    }
                }
            }
            "Saliente" => {
                summary.outgoing += 1;
                daily_row.outgoing += 1;
            }
            _ => {}
        }
    }
    summary.active_extensions = extensions.len();
    let mut extensions = extensions.into_values().collect::<Vec<_>>();
    extensions.sort_by(|a, b| {
        b.incoming
            .cmp(&a.incoming)
            .then(a.extension.cmp(&b.extension))
    });
    let mut dids = dids.into_iter().map(|(number, incoming)| DidTotal { number, incoming }).collect::<Vec<_>>();
    dids.sort_by(|a, b| b.incoming.cmp(&a.incoming).then(a.number.cmp(&b.number)));

    let term = query.q.as_deref().unwrap_or("").trim().chars().take(100).collect::<String>().to_lowercase();
    let calls = parsed.into_iter().filter(|call| {
        query.extension.as_deref().is_none_or(|value| call.extension == value)
            && query.did.as_deref().is_none_or(|value| call.destination == value)
            && query.direction.as_deref().is_none_or(|value| call.direction == value)
            && query.result.as_deref().is_none_or(|value| call.result == value)
            && (term.is_empty() || [call.caller.as_str(), call.destination.as_str(), call.extension.as_str(), call.direction.as_str(), call.result.as_str()]
                .iter().any(|part| part.to_lowercase().contains(&term)))
    }).collect::<Vec<_>>();
    let total = calls.len();
    let per_page = match query.per_page.unwrap_or(25) { 10 => 10, 50 => 50, _ => 25 };
    let total_pages = total.max(1).div_ceil(per_page);
    let page = query.page.unwrap_or(1).max(1).min(total_pages);
    let start = (page - 1) * per_page;
    let calls = calls.into_iter().skip(start).take(per_page).collect();
    Ok(Dashboard {
        status: ServiceStatus {
            connected: state.connected.load(Ordering::Relaxed),
            message: status,
            pbx_ip: settings.pbx_ip,
            pbx_port: settings.pbx_port,
            last_record_at,
        },
        summary,
        daily: daily.into_values().collect(),
        extensions,
        dids,
        menu_did: settings.menu_did,
        menu_areas,
        calls,
        pagination: Pagination { page, per_page, total, total_pages },
    })
}

fn parse_call(id: i64, received_at: &str, raw: &str) -> Option<CallRecord> {
    let mut chars = raw.chars().collect::<Vec<_>>();
    if chars.len() < 77 {
        return None;
    }
    let type_c = chars.len() > 80;
    chars.resize(if type_c { 120 } else { 80 }, ' ');
    let field = |start: usize, end: usize| {
        chars[start..end]
            .iter()
            .collect::<String>()
            .trim()
            .to_string()
    };
    let raw_date = field(0, 8);
    let date = parse_date(&raw_date)?;
    let call_time = field(9, 16);
    if call_time.is_empty() || !call_time.contains(':') {
        return None;
    }
    let extension = field(17, 22);
    let (number, ring, duration, condition) = if type_c {
        (field(28, 78), field(79, 83), field(84, 92), field(116, 119))
    } else {
        (field(26, 51), field(52, 56), field(57, 65), field(77, 80))
    };
    let condition = condition.to_ascii_uppercase();
    let (direction, caller, destination) = if let Some(index) = number.find("<I>") {
        let ddi = number[..index]
            .trim()
            .trim_start_matches("<D>")
            .trim()
            .to_string();
        let caller = number[index + 3..].trim().to_string();
        (
            "Entrante".to_string(),
            if caller.is_empty() {
                "Desconocido".into()
            } else {
                caller
            },
            if ddi.is_empty() {
                "Línea principal".into()
            } else {
                ddi
            },
        )
    } else if number.ends_with("EXT") {
        (
            "Interna".into(),
            extension.clone(),
            number.trim_end_matches("EXT").trim().into(),
        )
    } else {
        ("Saliente".into(), extension.clone(), number)
    };
    let result = match condition.as_str() {
        "AN" | "VA" => "Atendida",
        "NA" => "Sin respuesta",
        "RC" | "VR" => "Recibida",
        _ if direction == "Entrante" && parse_duration(&duration) > 0 => "Atendida",
        _ if direction == "Entrante" => "Estado no indicado",
        _ => "Completada",
    }
    .to_string();
    Some(CallRecord {
        id,
        call_date: date.format("%Y-%m-%d").to_string(),
        call_time,
        received_at: received_at.to_string(),
        extension,
        direction,
        caller,
        destination,
        ring,
        duration,
        condition,
        result,
    })
}

fn parse_date(value: &str) -> Option<NaiveDate> {
    ["%d-%m-%y", "%d/%m/%y", "%y-%m-%d", "%m-%d-%y", "%m/%d/%y"]
        .iter()
        .find_map(|format| NaiveDate::parse_from_str(value.trim(), format).ok())
}

fn parse_duration(value: &str) -> u64 {
    if let Some((hours, rest)) = value.split_once(':') {
        if let Some((minutes, seconds)) = rest.split_once('\'') {
            return hours.parse::<u64>().unwrap_or(0) * 3600
                + minutes.parse::<u64>().unwrap_or(0) * 60
                + seconds.parse::<u64>().unwrap_or(0);
        }
    }
    if let Some((minutes, seconds)) = value.split_once('\'') {
        return minutes.parse::<u64>().unwrap_or(0) * 60 + seconds.parse::<u64>().unwrap_or(0);
    }
    0
}

async fn export_csv(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if !authorized(&headers, &state) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let db = state.db.lock().unwrap();
    let mut statement =
        match db.prepare("SELECT received_at, raw_line FROM smdr_records ORDER BY id") {
            Ok(statement) => statement,
            Err(error) => {
                return (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response();
            }
        };
    let mut csv = String::from("received_at,raw_line\r\n");
    if let Ok(rows) = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) {
        for row in rows.flatten() {
            csv.push_str(&format!(
                "\"{}\",\"{}\"\r\n",
                row.0.replace('"', "\"\""),
                row.1.replace('"', "\"\"")
            ));
        }
    }
    (
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (header::CONTENT_DISPOSITION, "attachment; filename=smdr.csv"),
        ],
        csv,
    )
        .into_response()
}

fn authorized(headers: &HeaderMap, state: &AppState) -> bool {
    let expected = state.settings.lock().unwrap().api_token.clone();
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .is_some_and(|provided| !expected.is_empty() && provided == expected)
}

fn set_status(state: &AppState, value: &str) {
    *state.status.lock().unwrap() = value.to_string();
}
