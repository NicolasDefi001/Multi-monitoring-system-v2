# Multi Monitoring System v2 (MVP Page 1)

Prototype fonctionnel de la **Page 1** demandée:
- tableau live (refresh 1s par défaut)
- colonnes bid / ask / mark / index
- calcul du meilleur combo arbitrage ($ / %)
- distinction explicite des marchés Hyperliquid HIP-3 via `builder`

## Lancer

```bash
npm install
npm start
```

Puis ouvrir `http://localhost:3000`.

## Configuration

Variables d'environnement:

- `PORT` (défaut `3000`)
- `REFRESH_MS` (défaut `1000`)
- `USE_MOCK` (défaut `true`)
  - `true`: génère des données live simulées pour valider l'UI et le calcul
  - `false`: tente de récupérer des données Hyperliquid live (l2Book)

Exemple mode live:

```bash
USE_MOCK=false npm start
```

## Notes importantes

- Les connecteurs `Extended`, `Lighter`, `Aster` sont encore placeholders (affichés `NOT LIVE`) dans ce MVP.
- Le moteur de calcul `Best Combo` fonctionne déjà avec toutes les quotes disponibles.
- Le format de watchlist gère les cas HIP-3 en séparant `platform`, `builder`, `symbol`, et un `id` unique de marché.

## Prochaine étape

- Ajouter les connecteurs réels pour `Extended`, `Lighter`, `Aster`.
- Ajouter la Page 2 (paires custom + historique DB 1s).
