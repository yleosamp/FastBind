"use strict";
// Host language is the Premiere UI language, not the Windows/browser language.
// Adobe: https://developer.adobe.com/premiere-pro/uxp/resources/recipes/host-info/
// This module is pure presentation: never changes package names, paths or media.
const EN = Object.freeze({
  "FastBind": "FastBind",
  "↑ Atualizar": "↑ Update",
  "Versão {version} disponível. Abrir release no GitHub.": "Version {version} available. Open release on GitHub.",
  "Verificando atualizações…": "Checking for updates…",
  "Verificar atualizações": "Check for updates",
  "Você já está na versão mais recente.": "You are up to date.",
  "Não foi possível verificar agora. Tente mais tarde.": "Could not check right now. Try again later.",
  "Nova versão: {version}": "New version: {version}",
  "Versão instalada: {version}": "Installed version: {version}",
  "Abrir a página oficial do FastBind no GitHub para baixar a atualização.": "Open the official FastBind GitHub page to download the update.",
  "Não foi possível abrir o navegador. Tente novamente.": "Could not open the browser. Try again.",
  "Buscar preset ou arquivo": "Search presets or files",
  "Buscar presets e arquivos…": "Search presets and files…",
  "Limpar busca": "Clear search",
  "Perfil da biblioteca": "Library profile",
  "Gerenciar perfil": "Manage profile",
  "Expandir / recolher todos": "Expand / collapse all",
  "Expandir ou recolher todos": "Expand or collapse all",
  "Importar MOGRT": "Import MOGRT",
  "Adicionar MOGRT": "Add MOGRT",
  "+ MOGRT": "+ MOGRT",
  "Local da biblioteca": "Library location",
  "Dados do plugin": "Plugin data",
  "Opções": "Settings",
  "+ Novo perfil": "+ New profile",
  "Inserir selecionado": "Insert selected",
  "Renomear selecionado": "Rename selected",
  "Renomear perfil": "Rename profile",
  "Remover selecionado": "Remove selected",
  "Restaurar último removido": "Restore last removed",
  "Salvar seleção": "Save selection",
  "Salva a seleção nativa e também o projeto atual do Premiere.": "Saves the native selection and the current Premiere project.",
  "Presets salvos": "Saved presets",
  "Duplo clique no nome para inserir.": "Double-click a name to insert.",
  "Nome": "Name",
  "Nome do preset": "Preset name",
  "Escolha um nome para encontrar este preset na biblioteca.": "Choose a name to find this preset in the library.",
  "Cancelar": "Cancel",
  "Salvar": "Save",
  "Confirmar": "Confirm",
  "Continuar": "Continue",
  "Fechar": "Close",
  "Idioma / Language": "Language / Idioma",
  "Automático (Premiere)": "Automatic (Premiere)",
  "Português": "Português",
  "English": "English",
  "Idioma atualizado.": "Language updated.",
  "Premiere: {language}": "Premiere: {language}",
  "Idioma manual": "Manual language",
  "Organize ajustes, áudios e MOGRTs em um só lugar.": "Keep adjustments, audio and MOGRTs in one place.",
  "Recolher {name}": "Collapse {name}",
  "Ver conteúdo de {name}": "Show contents of {name}",
  "Sem cor": "No color",
  "Cor atualizada.": "Color updated.",
  "Vídeo": "Video",
  "Áudio": "Audio",
  "Modelo MOGRT": "MOGRT template",
  "Adjustment layer": "Adjustment layer",
  "Desativado": "Disabled",
  "O conteúdo interno é definido pelo template.": "Internal contents are defined by the template.",
  "Nenhum clipe listado neste pacote.": "No clips listed in this package.",
  "Perfil: {name}": "Profile: {name}",
  "Abrir perfil {name}": "Open profile {name}",
  "{name}. Duplo clique ou Enter para inserir.": "{name}. Double-click or press Enter to insert.",
  "Mudar cor de {name}": "Change color of {name}",
  "Inserir": "Insert",
  "Inserir {name}": "Insert {name}",
  "Remover": "Remove",
  "Remover {name} da biblioteca (recuperável)": "Remove {name} from the library (recoverable)",
  "Removido da lista. Você pode restaurar nas opções.": "Removed from the list. You can restore it in Settings.",
  "Nenhum preset ou arquivo encontrado.": "No presets or files found.",
  "Selecione os ajustes e o áudio na timeline e clique em Salvar seleção.": "Select adjustments and audio in the timeline, then click Save selection.",
  "Aguarde o fechamento da janela anterior.": "Wait for the previous dialog to close.",
  "O Premiere não disponibilizou a janela modal UXP. Salve o trabalho e reinicie o Premiere.": "Premiere did not provide the UXP dialog API. Save your work and restart Premiere.",
  "Inserido • {count} clipes em faixas livres.": "Inserted • {count} clips on free tracks.",
  "Confira os fades nativos deste pacote.": "Check this package's native fades.",
  " Confira os fades nativos deste pacote.": " Check this package's native fades.",
  "Novo perfil": "New profile",
  "Ex.: Transições, Zooms ou SFX": "E.g. Transitions, Zooms or SFX",
  "Renomear item": "Rename item",
  "Selecione um item da biblioteca.": "Select an item in the library.",
  "Arquivado. Você pode restaurar pelo menu ⋯.": "Archived. You can restore it in Settings.",
  "Item restaurado.": "Item restored.",
  "{path} — Faça backup desta pasta para guardar seus perfis e pacotes.": "{path} — Back up this folder to keep your profiles and packages safe.",
  " — Faça backup desta pasta para guardar seus perfis e pacotes.": " — Back up this folder to keep your profiles and packages safe.",
  "Não foi possível iniciar: {message}": "Could not start: {message}",
  "Preserva os clipes nativos e também salva o projeto atual do Premiere. A mídia original continua referenciada.": "Preserves native clips and also saves the current Premiere project. Original media remains linked.",
  "Salvar sem garantia dos fades nativos?": "Save without guaranteed native fades?",
  "Salvar mesmo assim?": "Save anyway?",
  "Captura cancelada. Sua seleção não foi modificada.": "Capture cancelled. Your selection was not changed.",
  "Seleção salva. Confira os fades nativos ao inserir.": "Selection saved. Check native fades when inserting.",
  "Seleção salva neste perfil.": "Selection saved in this profile.",
  "Importando {name}…": "Importing {name}…",
  "MOGRT adicionado. Duplo clique para inserir.": "MOGRT added. Double-click to insert.",
  "Conferindo arquivo do projeto…": "Checking the project file…",
  "Copiando seleção nativa…": "Copying the native selection…",
  "Salvando biblioteca…": "Saving the library…",
  "Carregando pacote…": "Loading the package…",
  "Preparando MOGRT…": "Preparing MOGRT…",
  "Inserindo em faixas livres…": "Inserting on free tracks…",
  "Caminho de arquivo inválido.": "Invalid file path.",
  "Namespace de arquivo do Windows não suportado.": "Unsupported Windows file namespace.",
  "O arquivo precisa ter um caminho nativo absoluto, não uma URL ou um caminho relativo.": "The file needs an absolute native path, not a URL or relative path.",
  "Biblioteca danificada. Os arquivos foram preservados; não vou substituir seus perfis.": "The library is damaged. Files were preserved; your profiles will not be overwritten.",
  "Falha ao verificar a biblioteca salva.": "Could not verify the saved library.",
  "Perfil não encontrado.": "Profile not found.",
  "Já existe um perfil com esse nome.": "A profile with that name already exists.",
  "Nome de perfil repetido.": "A profile with that name already exists.",
  "Item não encontrado.": "Item not found.",
  "Cor inválida.": "Invalid color.",
  "Nenhum item arquivado.": "No archived items.",
  "ID de biblioteca inválido.": "Invalid library ID.",
  "Não foi possível acessar o arquivo no disco: {path}. Confira se a unidade está disponível.": "Could not access the file on disk: {path}. Check that the drive is available.",
  "O caminho não aponta para um arquivo.": "The path does not point to a file.",
  "Arquivo vazio ou incompleto; o pacote não foi registrado.": "Empty or incomplete file; the package was not saved.",
  "Salve o projeto como .prproj antes de guardar a seleção.": "Save the project as .prproj before saving the selection.",
  "A cópia do arquivo ficou diferente da origem; o pacote não foi registrado.": "The file copy differs from its source; the package was not saved.",
  "Escolha um arquivo .mogrt.": "Choose a .mogrt file.",
  "O arquivo salvo foi alterado ou está incompleto. A timeline não foi modificada.": "The saved file has changed or is incomplete. The timeline was not changed.",
  "Identidade nativa indisponível.": "Native identity unavailable.",
  "Registro inválido.": "Invalid operation record.",
  "O registro da última operação não pôde ser lido.": "The last operation record could not be read.",
  "A inserção anterior ficou incompleta nesta sequência. Use Ctrl+Z para desfazê-la e tente novamente; a recuperação é automática, sem botão de liberação.": "The previous insertion is incomplete in this sequence. Use Ctrl+Z to undo it and try again; recovery is automatic, with no unlock button.",
  "A inserção anterior ficou incompleta nesta sequência. Use Ctrl+Z para desfazê-la e tente novamente; o FastBind reconhece o desfazer automaticamente.": "The previous insertion is incomplete in this sequence. Use Ctrl+Z to undo it and try again; FastBind detects the undo automatically.",
  "Projeto de destino indisponível.": "The destination project is unavailable.",
  "Sequência de destino indisponível.": "The destination sequence is unavailable.",
  "Parâmetro nativo opaco.": "Opaque native parameter.",
  "Abra um projeto no Premiere.": "Open a project in Premiere.",
  "Abra uma sequência na timeline.": "Open a sequence in the timeline.",
  "Salve o projeto do Premiere primeiro.": "Save the Premiere project first.",
  "Você mudou de projeto ou sequência durante a operação. Nada foi inserido na edição.": "The project or sequence changed during the operation. Nothing was inserted into the edit.",
  "Não foi possível consultar a taxa de áudio da sequência. A operação foi cancelada.": "Could not read the sequence audio sample rate. The operation was cancelled.",
  "O Premiere não retornou uma grade válida de amostras de áudio.": "Premiere did not return a valid audio sample grid.",
  "Premiere não criou a ação nativa.": "Premiere did not create the native action.",
  "Premiere recusou a ação nativa.": "Premiere rejected the native action.",
  "Premiere recusou a operação. Confira se as faixas estão desbloqueadas.": "Premiere rejected the operation. Check that the tracks are unlocked.",
  "Cache com muitos keyframes.": "Too many keyframes in the cache.",
  "O Premiere devolveu um clipe inválido em {track}. Leitura interrompida para proteger a edição. Reabra o painel e tente novamente.": "Premiere returned an invalid clip on {track}. Reading stopped to protect the edit. Reopen the panel and try again.",
  "O Premiere não disponibilizou os tipos de clipe/transição necessários.": "Premiere did not provide the required clip/transition types.",
  "Não foi possível ler a faixa {track}. Nenhuma inserção foi solicitada.": "Could not read track {track}. No insertion was requested.",
  "Transição opaca.": "Opaque transition.",
  "Transição sem duração legível.": "Transition has no readable duration.",
  "A timeline está mudando. Pare a reprodução e tente novamente.": "The timeline is changing. Stop playback and try again.",
  "Esta versão do Premiere não oferece duplicação nativa UXP.": "This Premiere version does not support native UXP cloning.",
  "Não foi possível criar uma sequência isolada da biblioteca.": "Could not create an isolated library sequence.",
  "A sequência de trabalho não está vazia. Operação cancelada.": "The working sequence is not empty. Operation cancelled.",
  "Há mais de uma pasta Pilha - Biblioteca no projeto. Renomeie a duplicada.": "There is more than one Pilha - Biblioteca folder in the project. Rename the duplicate.",
  "Há mais de uma pasta FastBind - Biblioteca no projeto. Renomeie a duplicada.": "There is more than one FastBind - Biblioteca folder in the project. Rename the duplicate.",
  "Há mais de uma pasta de biblioteca do FastBind no projeto. Renomeie a duplicada.": "There is more than one FastBind library folder in the project. Rename the duplicate.",
  "Não foi possível localizar a pasta da biblioteca.": "Could not locate the library folder.",
  "Há fades/transições que o Premiere não expõe nas faixas selecionadas. Eles podem não acompanhar a cópia. Os clipes originais não serão alterados.": "The selected tracks contain fades/transitions that Premiere does not expose. They may not be copied. Original clips will not be changed.",
  "Selecione os dois lados da transição para preservá-la no pacote.": "Select both sides of the transition to preserve it in the package.",
  "A sequência de origem mudou durante a captura. Salve a seleção novamente.": "The source sequence changed during capture. Save the selection again.",
  "Não foi possível reler a seleção original. Nenhum clipe foi copiado.": "Could not reread the original selection. No clips were copied.",
  "A cópia do Premiere ficou diferente da seleção. O pacote não foi salvo; a edição original não foi alterada.": "Premiere's copy differs from the selection. The package was not saved; the original edit was not changed.",
  "Premiere não preservou uma transição da seleção. A edição original não foi alterada.": "Premiere did not preserve a transition in the selection. The original edit was not changed.",
  "Não foi possível salvar o projeto. A seleção não foi registrada.": "Could not save the project. The selection was not saved.",
  "O pacote mudou durante o salvamento. Tente novamente.": "The package changed while saving. Try again.",
  "O pacote mudou durante a preparação. Tente novamente.": "The package changed during preparation. Try again.",
  "Fades/transições nativas não expostas pelo Premiere não têm preservação garantida neste pacote.": "Preservation of native fades/transitions not exposed by Premiere is not guaranteed in this package.",
  "Os efeitos do pacote mudaram durante o salvamento. Salve a seleção novamente.": "The package effects changed while saving. Save the selection again.",
  "Premiere não importou o pacote salvo.": "Premiere did not import the saved package.",
  "Não foi possível identificar com segurança a sequência importada. A edição não foi modificada.": "Could not safely identify the imported sequence. The edit was not changed.",
  "A biblioteca não pode ser a própria sequência de destino.": "The library cannot be the destination sequence itself.",
  "O pacote importado difere do que foi salvo. Nenhum clipe foi inserido na edição.": "The imported package differs from the saved version. No clips were inserted into the edit.",
  "Premiere não conseguiu abrir esse MOGRT. Confira fontes, versão e requisitos do template.": "Premiere could not open this MOGRT. Check the template's fonts, version and requirements.",
  "Abra sua sequência de edição, não a sequência da biblioteca.": "Open your editing sequence, not the library sequence.",
  "O playhead mudou durante a preparação. Pare a reprodução e tente novamente.": "The playhead moved during preparation. Stop playback and try again.",
  "A timeline mudou enquanto o pacote era preparado. Tente novamente.": "The timeline changed while preparing the package. Try again.",
  "Transição sem clipe correspondente no pacote.": "A transition has no corresponding clip in the package.",
  "O resultado nativo não passou na verificação. Use Ctrl+Z para desfazer a inserção do FastBind e tente novamente; a recuperação será automática.": "The native result could not be verified. Use Ctrl+Z to undo the FastBind insertion and try again; recovery will be automatic.",
  "Inserção confirmada na timeline, mas o registro de confirmação não pôde ser salvo. Confira o espaço disponível no disco.": "Insertion confirmed in the timeline, but the confirmation record could not be saved. Check the available disk space.",
  "A inserção foi confirmada na timeline. O Premiere ou o registro de confirmação emitiu um aviso; não é necessário inserir novamente.": "Insertion confirmed in the timeline. Premiere or the confirmation record reported a warning; you do not need to insert again.",
  "Tempo inválido: {value}": "Invalid time: {value}",
  "Grade de amostras de áudio inválida.": "Invalid audio sample grid.",
  "Clipe/faixa inválido.": "Invalid clip/track.",
  "Duração inválida.": "Invalid duration.",
  "Selecione entre 1 e 512 clipes.": "Select between 1 and 512 clips.",
  "O pacote começaria antes do início da sequência. Avance o playhead.": "The package would start before the sequence. Move the playhead forward.",
  "Um áudio ficou menor que uma amostra; nada foi inserido.": "An audio clip became shorter than one sample; nothing was inserted.",
  "Uma transição começaria antes da sequência. Avance o playhead.": "A transition would start before the sequence. Move the playhead forward.",
  "O pacote excede 64 faixas por tipo.": "The package exceeds 64 tracks per type.",
  "Colisão detectada; nada foi inserido.": "Collision detected; nothing was inserted.",
  "Use um nome de 1 a 100 caracteres.": "Use a name with 1 to 100 characters."
});
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function normalizePreference(value) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "auto";
  return ["auto", "pt", "en"].includes(v) ? v : "auto";
}
function detectHostLocale(uxp) {
  // Missing APIs/getter failures must never stop plugin startup. In that case
  // default to English; navigator.language would incorrectly use the OS locale.
  try { return uxp && uxp.host && typeof uxp.host.uiLocale === "string" ? uxp.host.uiLocale : ""; }
  catch (_) { return ""; }
}
function languageFor(preference, hostLocale) {
  const chosen = normalizePreference(preference);
  if (chosen !== "auto") return chosen;
  return typeof hostLocale === "string" && /^pt(?:[-_]|$)/i.test(hostLocale.trim()) ? "pt" : "en";
}
function interpolate(text, vars) {
  return text.replace(/\{([A-Za-z][\w]*)\}/g, (token, key) => vars && own(vars, key) ? String(vars[key]) : token);
}
function escapeRegex(text) { return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
const templates = Object.keys(EN).filter(key => /\{\w+\}/.test(key)).map(key => {
  const names = [], parts = []; let offset = 0;
  key.replace(/\{(\w+)\}/g, (token, name, index) => {
    parts.push(escapeRegex(key.slice(offset, index)), "([\\s\\S]+?)"); names.push(name); offset = index + token.length; return token;
  });
  parts.push(escapeRegex(key.slice(offset)));
  return { pattern: new RegExp("^" + parts.join("") + "$"), names, english: EN[key] };
});
function englishMessage(value) {
  const text = String(value == null ? "" : value);
  if (own(EN, text)) return EN[text];
  // These two joined status/error forms contain developer-owned prose around
  // an independent message. Captured filenames, paths and names stay verbatim.
  const startup = /^Não foi possível iniciar: ([\s\S]+)$/.exec(text);
  if (startup) return "Could not start: " + englishMessage(startup[1]);
  const inserted = /^(Inserido • \d+ clipes em faixas livres\.) (Confira os fades nativos deste pacote\.)$/.exec(text);
  if (inserted) return englishMessage(inserted[1]) + " " + englishMessage(inserted[2]);
  const saveAnyway = /^([\s\S]+) Salvar mesmo assim\?$/.exec(text);
  if (saveAnyway) return englishMessage(saveAnyway[1]) + " " + EN["Salvar mesmo assim?"];
  for (const template of templates) {
    const match = template.pattern.exec(text);
    if (match) {
      const vars = Object.create(null);
      template.names.forEach((key, i) => { vars[key] = match[i + 1]; });
      return interpolate(template.english, vars);
    }
  }
  // Recognize only the view's type-prefixed hint format. Arbitrary user names
  // containing this separator are not prose and must not be translated.
  if (/^(?:Vídeo|Áudio|Adjustment layer|Modelo MOGRT) • /.test(text)) return text.split(" • ").map(englishMessage).join(" • ");
  // Native Premiere errors and user content have no guessed translation.
  return text;
}
function create(options) {
  const settings = options || {}, hostLocale = settings.hostLocale;
  let preference = normalizePreference(settings.preference);
  return {
    hostLocale,
    get preference() { return preference; },
    get language() { return languageFor(preference, hostLocale); },
    setPreference(value) { preference = normalizePreference(value); return this.language; },
    t(key, vars) {
      const original = String(key == null ? "" : key);
      return interpolate(this.language === "pt" ? original : englishMessage(original), vars);
    },
    message(value) { return this.language === "pt" ? String(value == null ? "" : value) : englishMessage(value); }
  };
}
module.exports = { create, normalizePreference, detectHostLocale, languageFor, EN };
