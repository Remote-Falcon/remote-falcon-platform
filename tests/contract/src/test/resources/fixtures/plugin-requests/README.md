# Plugin request fixtures

Synthetic JSON bodies that mirror what the FPP plugin POSTs to
`remote-falcon-plugins-api`. Each file corresponds to one JSON-consuming
endpoint on `PluginController` and its request DTO under
`apps/plugins-api/src/main/java/com/remotefalcon/plugins/api/model/`.

These are used by `PluginsApiContractTest` as a black-box contract gate:
deserialize, assert required keys + types, round-trip. The goal is to
detect schema drift (renamed/removed fields, type changes) between the
plugin and the API. They do not exercise auth or persistence — that is
e2e's responsibility.

When you change a request DTO, update the matching fixture in the same PR.
