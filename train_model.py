from pathlib import Path
import io
import json
import zipfile
import urllib.request

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, IsolationForest
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

BASE = Path(__file__).resolve().parent
RAW = BASE / "data" / "raw"
MODELS = BASE / "models"
RAW.mkdir(parents=True, exist_ok=True)
MODELS.mkdir(parents=True, exist_ok=True)

CSV_PATH = RAW / "energydata.csv"
ZIP_URL = "https://archive.ics.uci.edu/static/public/374/appliances+energy+prediction.zip"

def download_dataset():
    if CSV_PATH.exists():
        print(f"Using existing dataset: {CSV_PATH}")
        return
    print("Downloading UCI Appliances Energy Prediction dataset...")
    data = urllib.request.urlopen(ZIP_URL, timeout=60).read()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        csv_names = [n for n in z.namelist() if n.lower().endswith(".csv")]
        if not csv_names:
            raise RuntimeError("No CSV file found in UCI archive.")
        with z.open(csv_names[0]) as src, open(CSV_PATH, "wb") as dst:
            dst.write(src.read())
    print(f"Saved: {CSV_PATH}")

def prepare(df):
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df["hour"] = df["date"].dt.hour
    df["dayofweek"] = df["date"].dt.dayofweek
    df["month"] = df["date"].dt.month

    # Keep the UCI sensor/weather variables and engineered time features.
    # Drop date because ML needs numeric features.
    feature_cols = [
        c for c in df.columns
        if c not in {"date", "Appliances"}
    ]
    X = df[feature_cols].apply(pd.to_numeric, errors="coerce")
    y = pd.to_numeric(df["Appliances"], errors="coerce")
    valid = X.notna().all(axis=1) & y.notna()
    X, y = X.loc[valid], y.loc[valid]
    return X, y, feature_cols

def main():
    download_dataset()
    df = pd.read_csv(CSV_PATH, sep=None, engine="python")
    print("Dataset shape:", df.shape)

    X, y, feature_cols = prepare(df)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42
    )

    model = RandomForestRegressor(
        n_estimators=250,
        max_depth=18,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)
    pred = model.predict(X_test)

    mae = mean_absolute_error(y_test, pred)
    rmse = float(np.sqrt(mean_squared_error(y_test, pred)))
    r2 = r2_score(y_test, pred)

    print("\nPrediction model results")
    print(f"MAE : {mae:.2f} Wh / 10 min")
    print(f"RMSE: {rmse:.2f} Wh / 10 min")
    print(f"R²  : {r2:.3f}")

    # Isolation Forest learns the normal multivariate operating pattern.
    anomaly = Pipeline([
        ("scale", StandardScaler()),
        ("isolation", IsolationForest(
            n_estimators=200,
            contamination=0.02,
            random_state=42,
            n_jobs=-1,
        )),
    ])
    anomaly.fit(X)

    # Store median defaults so the API can make a prediction even if
    # the browser only supplies some contextual values.
    medians = X.median(numeric_only=True).to_dict()

    joblib.dump(
        Pipeline([("features", _FeatureFrame(feature_cols)), ("model", model)]),
        MODELS / "energy_prediction_model.joblib",
    )
    joblib.dump(
        Pipeline([("features", _FeatureFrame(feature_cols)), ("model", anomaly)]),
        MODELS / "anomaly_model.joblib",
    )
    (MODELS / "feature_defaults.json").write_text(
        json.dumps(medians, indent=2),
        encoding="utf-8",
    )
    (MODELS / "metrics.json").write_text(
        json.dumps({
            "dataset": "UCI Appliances Energy Prediction",
            "rows": int(len(df)),
            "features": int(len(feature_cols)),
            "mae_wh_per_10min": round(float(mae), 3),
            "rmse_wh_per_10min": round(rmse, 3),
            "r2": round(float(r2), 4),
        }, indent=2),
        encoding="utf-8",
    )
    print("\nModels saved in:", MODELS)

class _FeatureFrame:
    """Convert JSON/dict input into the exact training feature order."""
    def __init__(self, columns):
        self.columns = list(columns)

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        if isinstance(X, pd.DataFrame):
            frame = X.copy()
        else:
            frame = pd.DataFrame(X)
        frame = frame.reindex(columns=self.columns)
        # Missing browser values are filled with training medians at API level.
        return frame.apply(pd.to_numeric, errors="coerce").fillna(0)

if __name__ == "__main__":
    main()
