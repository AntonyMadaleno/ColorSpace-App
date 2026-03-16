# ColorSpace

Application web d'analyse et segmentation couleur, avec:
- backend Python/FastAPI
- frontend Vite + React + TypeScript
- visualisation 2D + 3D WebGL (particules / GMM)

## Structure

- `backend/app/main.py`: API FastAPI (`/api/analyze`, `/api/segment`)
- `backend/app/services/`: traitement image, conversions, distributions, segmentation
- `frontend/src/App.tsx`: orchestration UI
- `frontend/src/components/`: modules (upload, distributions, segmentation)

## Lancement

### 1) Backend

Depuis `backend`:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Frontend

Depuis `frontend`:

```bash
npm install
npm run dev
```

Le frontend proxy automatiquement `/api` vers `http://localhost:8000`.

## API

- `POST /api/analyze`
  - multipart:
    - `file`: image (`png`, `jpg/jpeg`, `ppm`)
    - `options` (json): `{ "sample_size": 6000, "histogram_bins": 48, "gmm_components": 4, "gmm_sample_size": 4500 }`
  - reponse:
    - metadata image
    - preview image
    - distributions RGB/HSV/Lab
    - approximation GMM par espace couleur pour la vue 3D

- `POST /api/segment`
  - multipart:
    - `file`: image
    - `options` (json): `color_space`, `n_neighbors`, `n_segments`, `distance`, `normalize`, `sample_step`
  - reponse:
    - image segmentee
    - carte etiquettes
    - stats par label
