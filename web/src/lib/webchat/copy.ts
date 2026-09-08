/**
 * The words the widget itself says — in the four languages this product ships in.
 *
 * Every other surface in Denku is localised by one of the two mechanisms in landmine #22:
 * next-intl on the marketing tree, the DOM boundary in the dashboard. The widget is reachable by
 * neither. It renders inside an iframe on a stranger's website, from a static ES5 file with no
 * build step, and the locale boundary walks `document.body` of the dashboard — a different
 * document entirely.
 *
 * So its chrome was English, always, for everybody: a Turkish shop's Turkish customer opened the
 * chat and read "Write a message…" above a Turkish conversation. The AI answered in their
 * language and the furniture did not.
 *
 * The fix is the cheapest one that cannot drift: the strings live here, the embed route picks the
 * set matching the `locale` the loader already passes, and they travel in the boot payload the
 * widget is already reading. `app.js` falls back to English for any key that is missing, so an
 * older cached widget file never renders a blank button.
 *
 * Pure and dependency-free, with no `server-only`: nothing in it is a secret, and the same table
 * should be usable from either side if a future surface (a preview that labels its own controls,
 * say) needs the widget's own words.
 */

export const WIDGET_LOCALES = ["en", "es", "de", "tr"] as const;
export type WidgetLocale = (typeof WIDGET_LOCALES)[number];

export interface WidgetCopy {
  /** Under the name in the header, when the business has not written its own. */
  subtitle: string;
  placeholder: string;
  send: string;
  close: string;
  attach: string;
  /** What the visitor's own bubble says while an attachment-only message is in flight. */
  photo: string;
  voice: string;
  video: string;
  file: string;
  /** `{n}` is replaced with the count. */
  attachments: string;
  removeAttachment: string;
  tooManyFiles: string;
  errRateLimited: string;
  errTooLarge: string;
  errUnsupported: string;
  errUnavailable: string;
  errGeneric: string;
  errUpload: string;
  errSend: string;
}

const COPY: Readonly<Record<WidgetLocale, WidgetCopy>> = Object.freeze({
  en: {
    subtitle: "Customer Support",
    placeholder: "Write a message…",
    send: "Send",
    close: "Close chat",
    attach: "Attach a photo, video or document",
    photo: "Photo",
    voice: "Voice message",
    video: "Video",
    file: "File",
    attachments: "{n} attachments",
    removeAttachment: "Remove attachment",
    tooManyFiles: "You can attach up to four files at a time.",
    errRateLimited: "That is a lot of messages at once. Give it a minute and try again.",
    errTooLarge: "That file is too big. Please send a smaller one.",
    errUnsupported: "You can attach a photo, a video, an audio clip or a document.",
    errUnavailable: "This chat is not available right now.",
    errGeneric: "Something went wrong. Please try again.",
    errUpload: "That file did not upload. Check your connection and try again.",
    errSend: "That message did not go through. Check your connection and try again.",
  },
  es: {
    subtitle: "Atención al cliente",
    placeholder: "Escribe un mensaje…",
    send: "Enviar",
    close: "Cerrar el chat",
    attach: "Adjuntar una foto, un vídeo o un documento",
    photo: "Foto",
    voice: "Mensaje de voz",
    video: "Vídeo",
    file: "Archivo",
    attachments: "{n} archivos adjuntos",
    removeAttachment: "Quitar el archivo adjunto",
    tooManyFiles: "Puedes adjuntar hasta cuatro archivos a la vez.",
    errRateLimited: "Son muchos mensajes seguidos. Espera un minuto e inténtalo de nuevo.",
    errTooLarge: "Ese archivo es demasiado grande. Envía uno más pequeño.",
    errUnsupported: "Puedes adjuntar una foto, un vídeo, un audio o un documento.",
    errUnavailable: "El chat no está disponible en este momento.",
    errGeneric: "Algo ha ido mal. Inténtalo de nuevo.",
    errUpload: "El archivo no se ha subido. Comprueba tu conexión e inténtalo de nuevo.",
    errSend: "El mensaje no se ha enviado. Comprueba tu conexión e inténtalo de nuevo.",
  },
  de: {
    subtitle: "Kundenservice",
    placeholder: "Nachricht schreiben…",
    send: "Senden",
    close: "Chat schließen",
    attach: "Foto, Video oder Dokument anhängen",
    photo: "Foto",
    voice: "Sprachnachricht",
    video: "Video",
    file: "Datei",
    attachments: "{n} Anhänge",
    removeAttachment: "Anhang entfernen",
    tooManyFiles: "Sie können bis zu vier Dateien gleichzeitig anhängen.",
    errRateLimited: "Das sind viele Nachrichten auf einmal. Warten Sie eine Minute und versuchen Sie es erneut.",
    errTooLarge: "Diese Datei ist zu groß. Bitte senden Sie eine kleinere.",
    errUnsupported: "Sie können ein Foto, ein Video, eine Audioaufnahme oder ein Dokument anhängen.",
    errUnavailable: "Der Chat ist im Moment nicht verfügbar.",
    errGeneric: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    errUpload: "Die Datei wurde nicht hochgeladen. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
    errSend: "Die Nachricht wurde nicht gesendet. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
  },
  tr: {
    subtitle: "Müşteri Desteği",
    placeholder: "Bir mesaj yazın…",
    send: "Gönder",
    close: "Sohbeti kapat",
    attach: "Fotoğraf, video veya belge ekle",
    photo: "Fotoğraf",
    voice: "Sesli mesaj",
    video: "Video",
    file: "Dosya",
    attachments: "{n} ek",
    removeAttachment: "Eki kaldır",
    tooManyFiles: "Aynı anda en fazla dört dosya ekleyebilirsiniz.",
    errRateLimited: "Çok kısa sürede çok fazla mesaj gönderildi. Bir dakika sonra tekrar deneyin.",
    errTooLarge: "Bu dosya çok büyük. Lütfen daha küçük bir dosya gönderin.",
    errUnsupported: "Fotoğraf, video, ses kaydı veya belge ekleyebilirsiniz.",
    errUnavailable: "Sohbet şu anda kullanılamıyor.",
    errGeneric: "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
    errUpload: "Dosya yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.",
    errSend: "Mesaj gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin.",
  },
});

export function isWidgetLocale(value: unknown): value is WidgetLocale {
  return typeof value === "string" && (WIDGET_LOCALES as readonly string[]).includes(value);
}

/** The widget's own words. An unknown locale is English, never blank. */
export function widgetCopy(locale: string | null | undefined): WidgetCopy {
  return isWidgetLocale(locale) ? COPY[locale] : COPY.en;
}
