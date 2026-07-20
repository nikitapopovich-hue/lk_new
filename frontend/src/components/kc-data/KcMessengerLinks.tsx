import { expressProfileUrl, gmailComposeUrl, telegramProfileUrl } from "../../lib/kcMessengerLinks";
import "./KcMessengerLinks.css";

type Props = {
  telegramUsername?: string;
  expressId?: string;
  email?: string;
};

export function KcMessengerLinks(props: Props) {
  const tg = telegramProfileUrl(props.telegramUsername ?? "");
  const ex = expressProfileUrl(props.expressId ?? "");
  const mail = gmailComposeUrl(props.email ?? "");

  if (!tg && !ex && !mail) return null;

  return (
    <div className="kc-messenger-links" onClick={(e) => e.stopPropagation()}>
      {tg ? (
        <a
          className="kc-messenger-btn"
          href={tg}
          target="_blank"
          rel="noopener noreferrer"
          title="Telegram"
          aria-label="Telegram"
          onClick={(e) => e.stopPropagation()}
        >
          <img src="/kc-messengers/telegram.png" alt="" />
        </a>
      ) : null}
      {ex ? (
        <a
          className="kc-messenger-btn kc-messenger-btn--express"
          href={ex}
          target="_blank"
          rel="noopener noreferrer"
          title="eXpress"
          aria-label="eXpress"
          onClick={(e) => e.stopPropagation()}
        >
          <img src="/kc-messengers/express.png" alt="" />
        </a>
      ) : null}
      {mail ? (
        <a
          className="kc-messenger-btn"
          href={mail}
          target="_blank"
          rel="noopener noreferrer"
          title="Написать в Gmail"
          aria-label="Gmail"
          onClick={(e) => e.stopPropagation()}
        >
          <img src="/kc-messengers/gmail.png" alt="" />
        </a>
      ) : null}
    </div>
  );
}
