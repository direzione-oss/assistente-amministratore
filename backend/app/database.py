import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get("DATABASE_PATH") or os.path.join(BASE_DIR, "studio_condominiale.db")
os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def migrate_db():
    """Aggiunge in modo non distruttivo le colonne introdotte dopo la creazione iniziale."""
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(condomini)")).fetchall()}
        if "danea_id" not in cols:
            conn.execute(text("ALTER TABLE condomini ADD COLUMN danea_id INTEGER"))
        if "attivo" not in cols:
            conn.execute(text("ALTER TABLE condomini ADD COLUMN attivo BOOLEAN NOT NULL DEFAULT 1"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
