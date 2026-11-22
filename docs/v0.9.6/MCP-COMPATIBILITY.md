# Connect a desktop assistant in 0.9.6

E-Z works without MCP. For a desktop assistant, open **Connect my AI** in the Personal Notes profile, select the folders it may read, and add exclusions under **Never share**. Keep **Localhost only** for a client on this computer.

Press **Connect**, select the client in **Quick Connect**, copy the configuration and use **Test connection**. Keep the token private. A cloud assistant may receive the passages its client reads.

The six Personal Notes tools are `vault_overview`, `search_notes`, `ask_librarian`, `get_note`, `get_related` and `get_lineage`. The 0.9.6 E-Z view uses the local worker directly. [Client and protocol reference](https://github.com/Odenknight/Kosmos-Oden/blob/0.9.6/AGENT-API.md)
