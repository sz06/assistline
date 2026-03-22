# CLIProxyAPI Setup Guide

[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) is a proxy server that provides OpenAI-compatible API endpoints for various CLI tools (Gemini CLI, Claude Code, ChatGPT Codex, etc.). It lets you use free-tier models through a standard API interface.

## Prerequisites

- Docker installed and running
- A Google account (for Gemini CLI authentication)

## 1. Run CLIProxyAPI with Docker

```bash
docker run -d \
  --name cli-proxy-api \
  -p 8787:8787 \
  -p 8085:8085 \
  -v ~/.cli-proxy-api:/root/.cli-proxy-api \
  ghcr.io/router-for-me/cliproxyapi:latest
```

This starts CLIProxyAPI on port `8787` (API) and `8085` (management) with persistent storage at `~/.cli-proxy-api`.

### Key environment variables

| Variable         | Default | Description                          |
| ---------------- | ------- | ------------------------------------ |
| `PORT`           | `8787`  | Port the API server listens on       |
| `HOST`           | `0.0.0.0` | Host to bind to                   |

## 2. Authenticate with Google (Gemini CLI)

Run the login command inside the container:

```bash
docker exec -it cli-proxy-api ./CLIProxyAPI --login
```

This starts an OAuth flow. Follow the instructions in the terminal to authenticate with your Google account. Login tokens are saved to the mounted `~/.cli-proxy-api` directory.

> **Tip:** You can add multiple Google accounts for round-robin load balancing by repeating the login command.

## 3. Verify it's working

Check available models:

```bash
curl http://localhost:8787/v1/models
```

You should see a JSON response listing available models (e.g., `gemini-2.5-pro`).

## 4. Add as a Provider in Assistline

1. Go to **AI Providers → Add Provider** in the Assistline dashboard.
2. Select **CLIProxyAPI**.
3. Enter the **Base URL**:
   - If CLIProxyAPI runs on the same machine as Assistline's Docker stack: `http://host.docker.internal:8787/v1`
   - If CLIProxyAPI runs elsewhere: `http://<host-ip>:8787/v1`
4. Save — you'll be redirected to the update page to select a model.
5. Pick a model (e.g., `gemini-2.5-pro`) and save.

> **Note:** CLIProxyAPI does not require an API key. Authentication is handled via the OAuth login in step 2.

## Available Models

Models depend on which CLI tools you've authenticated. Common ones include:

| CLI Source   | Example Models                        |
| ------------ | ------------------------------------- |
| Gemini CLI   | `gemini-2.5-pro`, `gemini-2.5-flash`  |
| Claude Code  | `claude-sonnet-4-20250514`            |
| ChatGPT Codex| `o4-mini`, `gpt-4.1`                 |

Run `curl http://localhost:8787/v1/models` to see your currently available models.

## Troubleshooting

| Issue                        | Solution                                                              |
| ---------------------------- | --------------------------------------------------------------------- |
| Connection refused           | Check that the container is running: `docker ps`                     |
| No models returned           | Authenticate first via `http://localhost:8787/manage/gemini/login`    |
| Assistline can't connect     | Use `host.docker.internal` instead of `localhost` in the Base URL    |
| Models stop working          | Google sessions can expire — re-authenticate via the management API  |

## Further Reading

- [CLIProxyAPI GitHub](https://github.com/router-for-me/CLIProxyAPI)
- [CLIProxyAPI Guides](https://help.router-for.me/)
