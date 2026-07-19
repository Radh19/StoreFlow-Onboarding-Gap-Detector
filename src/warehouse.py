"""
warehouse.py
Single entry point for pulling onboarding data. Everything downstream
(analyze_cohorts.py, ai_agent.py) just receives a pandas DataFrame in the
same wide shape as the old onboarding_data.csv — it doesn't know or care
whether that came from a CSV, Snowflake, or BigQuery.

Swap ENGINE / connection details via environment variables, not code edits.
"""

import os
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

load_dotenv()

SQL_PATH = Path(__file__).parent.parent / "sql" / "onboarding_funnel.sql"


def _load_sql() -> str:
    return SQL_PATH.read_text()


def get_onboarding_data(source: str = None) -> pd.DataFrame:
    """
    source: 'snowflake' | 'bigquery' | 'postgres' | 'csv'
            Defaults to the DATA_SOURCE env var, falling back to 'csv'
            so local dev / the existing mock pipeline still works untouched.
    """
    source = source or os.environ.get("DATA_SOURCE", "csv")

    if source == "csv":
        # Local/dev fallback — identical to the Week 2 pipeline.
        return pd.read_csv("data/onboarding_data.csv")

    if source == "snowflake":
        return _from_snowflake()

    if source == "bigquery":
        return _from_bigquery()

    if source == "postgres":
        return _from_postgres()

    raise ValueError(f"Unknown DATA_SOURCE: {source}")


def _from_snowflake() -> pd.DataFrame:
    import snowflake.connector  # pip install snowflake-connector-python

    conn = snowflake.connector.connect(
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE", "ANALYTICS_WH"),
        database=os.environ.get("SNOWFLAKE_DATABASE", "ANALYTICS"),
        schema=os.environ.get("SNOWFLAKE_SCHEMA", "PUBLIC"),
    )
    try:
        return pd.read_sql(_load_sql(), conn)
    finally:
        conn.close()


def _from_bigquery() -> pd.DataFrame:
    from google.cloud import bigquery  # pip install google-cloud-bigquery

    client = bigquery.Client(project=os.environ["GCP_PROJECT_ID"])
    return client.query(_load_sql()).to_dataframe()


def _from_postgres() -> pd.DataFrame:
    import sqlalchemy  # pip install sqlalchemy psycopg2-binary

    engine = sqlalchemy.create_engine(os.environ["POSTGRES_URL"])
    with engine.connect() as conn:
        return pd.read_sql(_load_sql(), conn)


if __name__ == "__main__":
    df = get_onboarding_data()
    print(f"Loaded {len(df)} rows from source={os.environ.get('DATA_SOURCE', 'csv')}")
    print(df.head())
