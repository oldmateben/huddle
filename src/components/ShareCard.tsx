import QRCode from "qrcode";
import { useEffect, useState } from "react";

export const joinUrl = (code: string) => `${location.origin}/j/${code}`;

export default function ShareCard({ code, title }: { code: string; title: string }) {
  const url = joinUrl(code);
  const [qr, setQr] = useState("");
  const [big, setBig] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 640, color: { dark: "#1b2a4a", light: "#ffffff" } }).then(setQr);
  }, [url]);

  const mail = `mailto:?subject=${encodeURIComponent(`Join: ${title}`)}&body=${encodeURIComponent(
    `Join the live session here: ${url}\n\nOr go to ${location.origin} and enter code ${code}.\nNo sign-in needed. Just pick a name.`,
  )}`;

  return (
    <div className="share">
      {qr && (
        <button className="qr-thumb" onClick={() => setBig(true)} aria-label="Show QR code full screen">
          <img src={qr} alt="" />
        </button>
      )}
      <div>
        <p className="share-url">{url.replace(/^https?:\/\//, "")}</p>
        <div className="row">
          <button
            onClick={() => navigator.clipboard.writeText(url).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a className="button" href={mail}>
            Email invite
          </a>
          <button onClick={() => setBig(true)}>Show QR</button>
        </div>
      </div>
      {big && (
        <div className="qr-overlay" onClick={() => setBig(false)} role="dialog" aria-label="QR code">
          <img src={qr} alt={`QR code for ${url}`} />
          <p className="code-digits">{code}</p>
          <p>{location.host}</p>
          <p className="muted">Click anywhere to close</p>
        </div>
      )}
    </div>
  );
}
