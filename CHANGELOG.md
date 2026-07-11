# Changelog

## 2.1.0 — 2026-07-11

- Nouveau contrat `/api/integrations/v1` avec abilities Sanctum dédiées.
- Preview obligatoire et commit idempotent pour les opérations dépensières.
- Schémas Zod, annotations MCP et réponses structurées minimales.
- Timeout HTTP, retry limité aux GET transitoires et erreurs typées.
- Suppression des logs contenant les arguments utilisateur.
- Tests protocole/client, CI Node 20/22 multi-OS et contrôle du package.
- Support ChatGPT retiré de l’artefact local ; un serveur HTTPS/OAuth séparé sera nécessaire.
