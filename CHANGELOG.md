# Changelog

## 2.3.0 — 2026-08-04

- Fallback legacy sur les écritures commandes tant que `/api/integrations/v1` n'est pas déployé (rollout prod prévu le 10/08) : `create_order` → `POST /api/orders`, `pay_order` → `POST /api/orders/{id}/pay`, `preview_order` / `preview_order_payment` émulés localement (impact crédits + `due_date_warnings`). Les réponses fallback portent `legacy_fallback: true` ; sur ce chemin il n'y a ni idempotence serveur ni vérification du `confirmation_token` (la validation métier — J+3, gate clé API, horizon — reste serveur). Désactivable via `NINJALINKING_LEGACY_WRITE_FALLBACK=false`.
- Les délégations restent v1 uniquement (prix calculé côté serveur, non émulable).

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
