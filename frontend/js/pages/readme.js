/* The portal renders the repository Markdown files generated during the frontend image build. */
CBAuth.requireSession();

const languageButtons = [...document.querySelectorAll("[data-language]")];
const content = document.getElementById("readme-content");
const languageCopy = {
    es: { back: "Volver al portal", title: "Card Binder Pro · Sobre el proyecto" },
    en: { back: "Back to portal", title: "Card Binder Pro · Project overview" }
};
let requestNumber = 0;

async function setLanguage(language) {
    if (!languageCopy[language]) return;
    const currentRequest = ++requestNumber;
    document.documentElement.lang = language;
    document.title = languageCopy[language].title;
    document.querySelectorAll("[data-i18n='back']").forEach((element) => {
        element.textContent = languageCopy[language].back;
    });
    languageButtons.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.language === language));
    });
    content.setAttribute("aria-busy", "true");
    content.innerHTML = `<p role="status">${language === "es" ? "Cargando documentación…" : "Loading documentation…"}</p>`;

    try {
        const response = await fetch(`/readme-content/${language}.html`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const renderedMarkdown = await response.text();
        if (currentRequest !== requestNumber) return;
        content.innerHTML = renderedMarkdown;
        content.setAttribute("aria-busy", "false");
    } catch (error) {
        if (currentRequest !== requestNumber) return;
        const message = language === "es"
            ? "No se pudo cargar el README. Recarga la página para volver a intentarlo."
            : "The README could not be loaded. Reload the page to try again.";
        content.textContent = message;
        content.setAttribute("aria-busy", "false");
        console.error("Could not load project README", error);
    }
}

languageButtons.forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.language));
});

setLanguage("es");
