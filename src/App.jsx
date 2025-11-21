
import { useState, useEffect } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_HISTORY_API_URL;
const WENI_URL = import.meta.env.VITE_WENI_HISTORY_URL;

function App() {
  // --- Gate de senha (UX; validação real está na Twilio Function) ---
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    const savedPassword = sessionStorage.getItem("history_viewer_password");
    if (savedPassword) {
      setPassword(savedPassword);
      setAuthorized(true);
    }
  }, []);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setPasswordError("Digite a senha.");
      return;
    }
    sessionStorage.setItem("history_viewer_password", password.trim());
    setAuthorized(true);
    setPasswordError("");
  };

  // --- Estado principal (Twilio) ---
  const [rawNumber, setRawNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [error, setError] = useState("");

  // --- Estado Weni ---
  const [weniData, setWeniData] = useState(null);
  const [weniLoading, setWeniLoading] = useState(false);
  const [weniError, setWeniError] = useState("");

  const fetchWeniHistory = async (plainNumber) => {
    setWeniError("");
    setWeniData(null);

    if (!WENI_URL) {
      setWeniError("URL do histórico Weni não configurada.");
      return;
    }

    try {
      setWeniLoading(true);

      const url = `${WENI_URL}?whatsapp=${encodeURIComponent(plainNumber)}`;
      const resp = await fetch(url);

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `Erro Weni HTTP ${resp.status}`);
      }

      const data = await resp.json();

      // Ordena mensagens Weni em ordem cronológica (mais antigas -> mais novas)
      const sortedMessages = (data.messages || []).slice().sort((a, b) => {
        const da = new Date(a.created_on || a.sent_on || 0);
        const db = new Date(b.created_on || b.sent_on || 0);
        return da - db;
      });

      setWeniData({
        ...data,
        messages: sortedMessages,
      });
    } catch (err) {
      console.error("Erro ao buscar histórico Weni:", err);
      setWeniError(err.message || "Erro ao buscar histórico Weni.");
    } finally {
      setWeniLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setError("");
    setSelectedConv(null);
    setConversations([]);
    setWeniData(null);
    setWeniError("");

    if (!rawNumber.trim()) {
      setError("Informe um número de cliente.");
      return;
    }

    if (!password.trim()) {
      setAuthorized(false);
      setError("Sessão sem senha. Informe a senha novamente.");
      return;
    }

    try {
      setLoading(true);

      let input = rawNumber.trim();
      // Normaliza input para algo tipo +5513...
      if (input.startsWith("whatsapp:")) {
        input = input.replace(/^whatsapp:/, "");
      }

      if (!input.startsWith("+")) {
        setError("Use o formato +5511..., ex: +5513997254841.");
        setLoading(false);
        return;
      }

      const plainNumber = input; // para Weni
      const address = `whatsapp:${plainNumber}`; // para Twilio

      // ---- Twilio ----
      const resp = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address,
          password: password.trim(),
        }),
      });

      if (resp.status === 401) {
        await resp.json().catch(() => ({}));
        sessionStorage.removeItem("history_viewer_password");
        setAuthorized(false);
        setPassword("");
        setPasswordError("Senha inválida. Digite novamente.");
        setLoading(false);
        return;
      }

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `Erro HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const convs = (data.conversations || [])
        .slice()
        .sort(
          (a, b) =>
            new Date(b.dateCreated || 0) - new Date(a.dateCreated || 0)
        ); // mais recentes no topo

      setConversations(convs);
      setSelectedConv(convs[0] || null);

      // ---- Weni (em paralelo após Twilio ok) ----
      fetchWeniHistory(plainNumber);
    } catch (err) {
      console.error(err);
      setError(err.message || "Erro ao buscar histórico.");
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (d) => {
    if (!d) return "";
    const date = new Date(d);
    return date.toLocaleString("pt-BR");
  };

  // --- TELA DE SENHA: modal centralizado tipo alert ---
  if (!authorized) {
    return (
      <div className="auth-root">
        <div className="auth-backdrop" />
        <div className="auth-modal">
          <div className="auth-card">
            <div className="auth-icon">🔒</div>
            <h1 className="auth-title">Acesso restrito</h1>
            <p className="auth-subtitle">
              Este painel é destinado apenas a pessoas autorizadas. Informe a
              senha de acesso para continuar.
            </p>

            <form onSubmit={handlePasswordSubmit} className="auth-form">
              <label className="auth-field">
                <span>Senha</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite a senha"
                />
              </label>
              <button type="submit">Entrar</button>
            </form>

            {passwordError && (
              <div className="auth-error">{passwordError}</div>
            )}

            <p className="auth-hint">
              Compartilhe esta senha apenas com pessoas autorizadas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- App normal (já passou pela tela de senha) ---
  return (
    <div className="app-root">
      <div className="app-card">
        <header className="card-header">
          <h1>Histórico de Conversas</h1>
          <p>
            Digite o número do cliente e visualize, lado a lado, as conversas na
            Twilio e o histórico na Weni.
          </p>
        </header>

        <main className="card-main">
          <form onSubmit={handleSearch} className="search-row">
            <label className="field">
              <span>Número do cliente (WhatsApp)</span>
              <input
                type="text"
                placeholder="+5513997254841"
                value={rawNumber}
                onChange={(e) => setRawNumber(e.target.value)}
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Buscando..." : "Buscar histórico"}
            </button>
          </form>
          {error && <div className="error-banner">{error}</div>}

          <section className="content-area">
            {/* Coluna 1: lista de conversas Twilio */}
            <aside className="conversations-list">
              <h2>Conversas (Twilio)</h2>
              {loading && <div className="loading">Carregando...</div>}
              {!loading && conversations.length === 0 && (
                <div className="empty">Nenhuma conversa encontrada.</div>
              )}
              <ul>
                {conversations.map((conv) => (
                  <li
                    key={conv.conversationSid}
                    className={
                      selectedConv?.conversationSid === conv.conversationSid
                        ? "conv-item selected"
                        : "conv-item"
                    }
                    onClick={() => setSelectedConv(conv)}
                  >
                    <div className="conv-title">
                      {conv.friendlyName || conv.conversationSid}
                    </div>
                    <div className="conv-meta">
                      <span>Início: {formatDateTime(conv.dateCreated)}</span>
                      <span>{conv.messages?.length || 0} mensagens</span>
                    </div>
                    {conv.messages?.length > 0 && (
                      <div className="conv-preview">
                        {conv.messages[conv.messages.length - 1].body?.slice(
                          0,
                          60
                        )}
                        {conv.messages[conv.messages.length - 1].body?.length >
                          60 && "..."}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </aside>

            {/* Coluna 2: conversa Twilio selecionada */}
            <section className="conversation-view">
              <header className="conv-header">
                <div>
                  <h2>Conversa (Twilio)</h2>
                  {selectedConv ? (
                    <p>
                      Criada em {formatDateTime(selectedConv.dateCreated)} •{" "}
                      {selectedConv.messages?.length || 0} mensagens
                    </p>
                  ) : (
                    <p>Selecione uma conversa na lista da esquerda.</p>
                  )}
                </div>
              </header>

              <div className="messages-container">
                {selectedConv && selectedConv.messages?.length > 0 ? (
                  selectedConv.messages.map((msg) => {
                    const isAgent =
                      msg.author && !msg.author.startsWith("whatsapp:");
                    return (
                      <div
                        key={msg.sid}
                        className={
                          "message-bubble " + (isAgent ? "agent" : "customer")
                        }
                      >
                        <div className="message-meta">
                          <span className="author">
                            {isAgent ? msg.author : "Cliente"}
                          </span>
                          <span className="timestamp">
                            {formatDateTime(msg.dateCreated)}
                          </span>
                        </div>
                        <div className="message-body">{msg.body}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className="placeholder">
                    {selectedConv
                      ? "Essa conversa não possui mensagens."
                      : "Nenhuma conversa selecionada."}
                  </div>
                )}
              </div>
            </section>

            {/* Coluna 3: histórico Weni (único card, sem separação por salas) */}
            <aside className="weni-view">
              <header className="weni-header">
                <h2>Histórico Weni</h2>
                {weniData?.contact && (
                  <p>
                    {weniData.contact.name || "Contato sem nome"}
                    {weniData.contact.fields?.document
                      ? ` • CPF: ${weniData.contact.fields.document}`
                      : ""}
                  </p>
                )}
              </header>

              <div className="weni-meta">
                {weniLoading && <div>Carregando histórico Weni...</div>}
                {weniError && <div className="weni-error">{weniError}</div>}

                {!weniLoading && !weniError && weniData && (
                  <>
                    <div>
                      Mensagens:{" "}
                      <strong>{weniData.messagesCount ?? 0}</strong>
                    </div>
                    {weniData.contact?.last_seen_on && (
                      <div>
                        Último visto:{" "}
                        <strong>
                          {formatDateTime(weniData.contact.last_seen_on)}
                        </strong>
                      </div>
                    )}
                    {Array.isArray(weniData.groups) &&
                      weniData.groups.length > 0 && (
                        <div>
                          Grupos:{" "}
                          <strong>{weniData.groups.length}</strong>
                        </div>
                      )}
                  </>
                )}
              </div>

              <div className="weni-messages">
                {weniLoading && (
                  <div className="placeholder">
                    Carregando histórico Weni...
                  </div>
                )}

                {!weniLoading && weniError && (
                  <div className="placeholder">{weniError}</div>
                )}

                {!weniLoading &&
                  !weniError &&
                  weniData &&
                  weniData.messages &&
                  weniData.messages.length > 0 &&
                  weniData.messages.map((m) => {
                    const isAgent = m.direction === "out"; // in = cliente, out = bot/fluxo
                    return (
                      <div
                        key={m.id}
                        className={
                          "weni-message " + (isAgent ? "agent" : "customer")
                        }
                      >
                        <div className="weni-message-meta">
                          <span className="author">
                            {isAgent ? "Bot/Weni" : "Cliente"}
                          </span>
                          <span className="timestamp">
                            {formatDateTime(
                              m.created_on || m.sent_on || null
                            )}
                          </span>
                        </div>
                        <div className="weni-message-body">{m.text}</div>
                      </div>
                    );
                  })}

                {!weniLoading &&
                  !weniError &&
                  weniData &&
                  (!weniData.messages || weniData.messages.length === 0) && (
                    <div className="placeholder">
                      Nenhuma mensagem encontrada na Weni.
                    </div>
                  )}

                {!weniLoading && !weniError && !weniData && (
                  <div className="placeholder">
                    Busque um número para carregar o histórico Weni.
                  </div>
                )}
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
