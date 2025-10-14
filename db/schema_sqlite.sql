-- Schema SQLite para Gestion de Proyectos
-- Equivalente al schema MySQL pero adaptado para SQLite

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    usuario TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    rol TEXT DEFAULT 'usuario' CHECK (rol IN ('admin', 'usuario'))
);

-- Tabla de proyectos
CREATE TABLE IF NOT EXISTS proyectos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    cliente TEXT,
    fecha_inicio DATE,
    fecha_fin DATE
);

-- Tabla de fases
CREATE TABLE IF NOT EXISTS fases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id INTEGER,
    nombre TEXT CHECK (nombre IN ('Planificación', 'Ejecución', 'Cierre')),
    estado TEXT DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'En progreso', 'Completado')),
    fecha_inicio DATE,
    fecha_fin DATE,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
);

-- Tabla de tareas
CREATE TABLE IF NOT EXISTS tareas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id INTEGER,
    nombre TEXT,
    descripcion TEXT,
    responsable INTEGER,
    prioridad TEXT DEFAULT 'Media' CHECK (prioridad IN ('Baja', 'Media', 'Alta')),
    fase TEXT DEFAULT 'Planificación' CHECK (fase IN ('Planificación', 'Ejecución', 'Cierre')),
    fecha_limite DATE,
    progreso INTEGER DEFAULT 0,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
    FOREIGN KEY (responsable) REFERENCES usuarios(id)
);

-- Tabla de comentarios en tareas (chat interno)
CREATE TABLE IF NOT EXISTS comentarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarea_id INTEGER,
    usuario_id INTEGER,
    comentario TEXT,
    fecha_comentario DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Tabla de archivos adjuntos
CREATE TABLE IF NOT EXISTS archivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarea_id INTEGER,
    nombre_archivo TEXT,
    ruta_archivo TEXT,
    tamaño INTEGER,
    tipo_archivo TEXT,
    fecha_subida DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE
);

-- Tabla de notificaciones
CREATE TABLE IF NOT EXISTS notificaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    mensaje TEXT,
    leida INTEGER DEFAULT 0,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Tabla de logs de actividad
CREATE TABLE IF NOT EXISTS logs_actividad (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    accion TEXT,
    entidad_tipo TEXT,
    entidad_id INTEGER,
    fecha_accion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario);
CREATE INDEX IF NOT EXISTS idx_fases_proyecto ON fases(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_tareas_proyecto ON tareas(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_tareas_responsable ON tareas(responsable);
CREATE INDEX IF NOT EXISTS idx_comentarios_tarea ON comentarios(tarea_id);
CREATE INDEX IF NOT EXISTS idx_archivos_tarea ON archivos(tarea_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_logs_usuario ON logs_actividad(usuario_id);

-- Tabla de evidencias fotográficas
CREATE TABLE IF NOT EXISTS evidencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id INTEGER NOT NULL,
    tarea_id INTEGER,
    categoria TEXT NOT NULL CHECK (categoria IN ('OK','LEVE','CRITICO')),
    comentario TEXT,
    image_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
    FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_evidencias_proyecto ON evidencias(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_evidencias_tarea ON evidencias(tarea_id);
CREATE INDEX IF NOT EXISTS idx_evidencias_categoria ON evidencias(categoria);
CREATE INDEX IF NOT EXISTS idx_evidencias_created_at ON evidencias(created_at);

-- Insertar usuario administrador por defecto (password: admin123)
INSERT OR IGNORE INTO usuarios (id, nombre, usuario, email, password, rol) 
VALUES (1, 'Administrador', 'admin', 'admin@gestion.com', '$2b$10$zbrD390ESjaH0lD5l83vsu7jmpOmQPXffQOz.QXxXihphpDDg5lNe', 'admin');