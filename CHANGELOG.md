# Changelog

## 2.2.0 — 2026-08-04

- Nouveau champ optionnel `links[].due_date` (YYYY-MM-DD) sur `preview_order` / `create_order` : deadline « livré au plus tard le ». Validation métier côté serveur (J+3 minimum, 12 mois maximum, cohérence avec `delivery_date`). Les deadlines serrées sont signalées par `due_date_warnings` dans le preview.
- `due_date` exposée dans les liens retournés (`get_order`, `get_link`, `create_order`).

## 2.1.0 — 2026-07-11

- Nouveau contrat `/api/integrations/v1` avec abilities Sanctum dédiées.
- Preview obligatoire et commit idempotent pour les opérations dépensières.
- Schémas Zod, annotations MCP et réponses structurées minimales.
- Timeout HTTP, retry limité aux GET transitoires et erreurs typées.
- Suppression des logs contenant les arguments utilisateur.
- Tests protocole/client, CI Node 20/22 multi-OS et contrôle du package.
- Support ChatGPT retiré de l’artefact local ; un serveur HTTPS/OAuth séparé sera nécessaire.
