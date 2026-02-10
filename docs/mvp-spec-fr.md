# Spécification MVP – Plateforme de monitoring perp/perp (V1)

## 1) Ce que j'ai compris (validé)

- Tu veux une plateforme de **monitoring live** pour arbitrage **perp vs perp**.
- Plateformes visées: **Hyperliquid, Extended, Lighter, Aster**.
- Priorité absolue: **Page 1** (dashboard global live).
- Fréquence de rafraîchissement initiale: **1 seconde**.
- Authentification/sécurité: **pas prioritaire** pour l'instant.
- Les alertes: **plus tard**.

## 2) Point critique Hyperliquid HIP-3 (builder perps)

Hyperliquid peut avoir plusieurs marchés "proches" pour un même sous-jacent (ex: COPPER),
avec des order books différents selon le builder/perp.

Conséquence produit:
- On ne peut pas faire un mapping seulement par ticker racine (ex: `COPPER`).
- Il faut une clé de marché explicite, par exemple:
  - `platform = hyperliquid`
  - `venue_group = hip3`
  - `builder = xyz|flx|hyna|km|...`
  - `symbol = COPPER-USDC` ou `COPPER-USDH`

## 3) V1 – Page 1 (read-only)

Tableau live par ticker, avec colonnes multi-plateformes:
- Bid
- Ask
- Mark
- Index
- Statut de flux (`LIVE` / `NOT LIVE`)

Et une colonne **Best Combo**:
- meilleur `ask` (achat) sur une plateforme
- meilleur `bid` (vente) sur une autre
- spread affiché en `$` et `%`

### Règle de calcul (simple V1)

- `best_long = min(ask)`
- `best_short = max(bid)`
- `spread_$ = best_short - best_long`
- `spread_% = ((best_short / best_long) - 1) * 100`

> Note: ceci est un spread brut (sans frais/slippage/funding net), conforme à ta priorité actuelle.

## 4) V2 – Page 2 (après Page 1)

Suivi de paires personnalisées:
- clé paire: `ticker + plateforme A + plateforme B`
- ajout/suppression de paires via UI

Métriques live + historique:
- spread bid/ask
- différence mark
- différence index
- funding A vs funding B

Fenêtres de visualisation:
- 5m, 1h, 4h, 12h, 24h, 7j

Résolution de stockage initiale:
- **1 seconde**

## 5) Stack technique proposée (simple, stable)

- **Backend**: Node.js (NestJS ou Express) + WebSocket
- **Ingestion market data**: workers WS/REST par exchange
- **DB**: PostgreSQL + TimescaleDB
- **Frontend**: React + table temps réel
- **Infra VPS**: Docker Compose (app + db + reverse proxy)

Pourquoi ce choix:
- facile à déployer sur VPS
- standard, documenté
- évite le debug exotique

## 6) Modèle de données minimal (V1/V2)

### `markets`
- `id`
- `platform` (hyperliquid|extended|lighter|aster)
- `symbol_display`
- `base_asset`
- `quote_asset`
- `market_type` (perp)
- `builder_tag` (nullable, utilisé pour HIP-3)
- `is_active`

### `quotes_1s`
- `ts`
- `market_id`
- `bid`
- `ask`
- `mark`
- `index_price`
- `funding_rate` (nullable)

### `watch_pairs`
- `id`
- `ticker_group`
- `market_a_id`
- `market_b_id`
- `enabled`

## 7) Questions restantes (pour éviter toute ambiguïté)

1. Pour Page 1, veux-tu une ligne par **ticker racine** (ex COPPER) ou par **marché exact** (ex COPPER-USDC xyz, COPPER-USDH flx)?
2. Quand plusieurs marchés Hyperliquid existent (HIP-3), veux-tu:
   - tous affichés séparément,
   - ou un seul "préféré" par builder/tag?
3. Pour les colonnes Extended/Lighter/Aster quand indisponible, on affiche `NOT LIVE` (comme ton Excel) — confirmé?
4. Devise d'affichage principale pour spread `$`: USDC/USDT/USDH mélangés ou conversion forcée USD?
5. Veux-tu déjà un filtre "n'afficher que spread_% > X" en V1?

## 8) Plan d'exécution

1. Implémenter ingestion live + normalisation symboles (Hyperliquid HIP-3 inclus)
2. Construire API WS/HTTP pour la table Page 1
3. Construire UI Page 1 read-only
4. Ajouter persistance 1s pour préparer la Page 2
5. Construire UI Page 2 multi-paires + graphes
