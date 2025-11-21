
import { useState, useEffect } from "react";
import "./App.css";


const API_URL = import.meta.env.VITE_HISTORY_API_URL;

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

  // --- Lógica normal do app ---
  const [rawNumber, setRawNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [error, setError] = useState("");

  const handleSearch = async (e) => {
    e.preventDefault();
    setError("");
    setSelectedConv(null);
    setConversations([]);

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

      let address = rawNumber.trim();
      if (!address.startsWith("whatsapp:")) {
        if (address.startsWith("+")) {
          address = `whatsapp:${address}`;
        } else {
          setError("Use o formato +5511..., ex: +5513997254841.");
          setLoading(false);
          return;
        }
      }

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
      const convs = data.conversations || [];
      setConversations(convs);
      setSelectedConv(convs[0] || null);
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
            Digite o número do cliente e visualize todas as conversas em um só
            lugar.
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
            <aside className="conversations-list">
              <h2>Conversas</h2>
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

            <section className="conversation-view">
              <header className="conv-header">
                <div>
                  <h2>Conversa</h2>
                  {selectedConv ? (
                    <p>
                      Criada em {formatDateTime(selectedConv.dateCreated)} •{" "}
                      {selectedConv.messages?.length || 0} mensagens
                    </p>
                  ) : (
                    <p>Selecione uma conversa na lista ao lado.</p>
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
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
