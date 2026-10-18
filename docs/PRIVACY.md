# Privacy and local data

FastBind does not include analytics, telemetry, advertising or accounts. Editing and library storage use Premiere's local UXP API and filesystem access. A lightweight update check reads public FastBind release metadata from GitHub. Adobe Creative Cloud, Premiere and GitHub have their own services and privacy policies, independent of FastBind.

## Update checks

The panel checks `https://api.github.com/repos/yleosamp/FastBind/releases/latest` for a newer stable release. Automatic checks use a 24-hour local cache; **Settings > Check for updates** can check manually. A failed or offline check does not prevent editing. No GitHub login or token is used.

These requests send only ordinary connection/request metadata to GitHub, such as your IP address and HTTP headers. **No project files, project/sequence names, clip names, library contents, paths, diagnostics or custom tracking identifiers are included in the request.** The plugin does not run a separate analytics or telemetry service.

The local `updates.json` cache stores only check timestamps and minimal release/version/link information, separate from the library. Clicking an update notice opens a validated FastBind GitHub release URL in your browser. Browser access is subject to your browser's and GitHub's own policies. FastBind never automatically downloads or installs updates and does not restart Premiere.

## What is stored

The plugin's local data folder contains:

- Profiles, package names, clip metadata, colors and file paths in alternating library journals.
- A copy of the **Premiere project file** for each saved selection, plus an internal sequence holding the captured package. The copied `.prproj` can include information about the rest of the project, not only the selected clips.
- Imported MOGRT files.
- Language preference and an insertion journal used for recovery/verification.
- Minimal update-check timestamps and release information in `updates.json`.
- Local error diagnostics, including a rolling history of up to 30 entries. These can contain project/sequence names, paths, clip information, timestamps and technical error details.

Ordinary saved selections continue to reference external media. In 0.4.0, **Export profile** explicitly collects recognized media into a local `.fastbind` archive. It creates a separate Premiere project importing only the profile's library sequences/dependencies, rather than distributing the complete stored project snapshots. Export saves and restores the user's active project. No profile/media archive is uploaded automatically.

The archive includes whole collected media files, editable native sequence/effect data, MOGRTs, clip/profile names and a requirements list. Source paths exposed as ordinary XML file references are replaced with transport tokens; caches/relative paths are cleared. Native opaque/binary metadata, third-party effects and MOGRTs can still contain private information or additional external references. This is not a forensic anonymizer: review content and licenses before sharing.

Imported resources are checksum-verified, rebased and copied into a new private plugin data folder before the new profile is committed. The sender's archive is no longer needed afterward. Temporary export projects and files from interrupted imports may remain in private storage; they are never added as a usable profile unless validation/commit finishes. Fonts and installed plugins are not bundled. The first implementation limits archives and expanded contents to 256 MiB and refuses unsupported detected dependencies.

## Your controls

Use the folder button in the panel to see the data location. Back up the whole folder. **Remove** archives a package in the library; it does not erase its saved files from disk. Uninstalling or moving plugin data can make packages unavailable, so back up before changing it.

Nothing in this folder is automatically sent to the developer. Before sharing a diagnostic, screenshot or project, review it for personal names, client information, private file paths and licensed content. Do not post the entire library folder in a public issue. This repository and release packages contain no user libraries or saved project/media payloads.

## Português

O FastBind não inclui telemetria, anúncios ou contas. A edição e a biblioteca usam a API local do Premiere e acesso a arquivos. Uma consulta simples lê os dados públicos da release do FastBind no GitHub. Creative Cloud, Premiere e GitHub têm serviços e políticas próprios, independentes do FastBind.

A consulta usa `https://api.github.com/repos/yleosamp/FastBind/releases/latest`, sem login nem token. A checagem automática tem cache local de 24 horas; a engrenagem permite **Verificar atualizações** manualmente. O GitHub recebe os metadados normais da conexão, como endereço IP e cabeçalhos HTTP. **Não enviamos arquivos, nomes de projeto/sequência/clipe, biblioteca, caminhos, diagnósticos ou identificadores próprios de rastreamento na requisição.** Falhas de conexão não bloqueiam a edição.

O arquivo local `updates.json` guarda apenas horários de consulta e informações mínimas de versão/link da release, separado da biblioteca. Clicar no aviso abre uma URL validada da release do FastBind no GitHub, no seu navegador. O acesso pelo navegador segue as políticas dele e do GitHub. O plugin não baixa/instala atualizações nem reinicia o Premiere automaticamente.

A pasta de dados guarda perfis, nomes de pacotes/clipes, cores, caminhos, MOGRTs, preferência de idioma, registros de inserção e diagnósticos locais. Ao salvar uma seleção, ele também guarda uma **cópia do projeto `.prproj`**: esse arquivo pode conter informações de outras partes do projeto, não apenas dos clipes selecionados. A seleção salva normalmente continua referenciando a mídia original.

Na 0.4.0, **Exportar perfil** coleta as mídias reconhecidas em um arquivo local `.fastbind`. É criado um projeto separado apenas com as sequências/dependências daquele perfil, sem distribuir o snapshot completo do projeto original. A operação salva e depois reativa o projeto atual. Não há upload automático. O pacote inclui mídias inteiras, nomes e metadados dos presets, MOGRTs e requisitos. Caminhos de arquivo expostos no XML são substituídos, mas dados binários/opacos de efeitos e MOGRTs ainda podem conter informações privadas e referências adicionais: não é uma ferramenta de anonimização. Confira o conteúdo e suas licenças antes de enviar.

Na importação, os arquivos são conferidos e copiados para uma pasta privada nova antes de gravar o perfil; depois o pacote recebido pode ser apagado. Arquivos temporários de exportação/importações interrompidas podem ficar na pasta privada, sem virar perfis utilizáveis. Fontes e plugins não são incorporados. A primeira implementação limita pacote/conteúdo expandido a 256 MiB e recusa dependências incompatíveis detectadas.

O histórico de erros mantém até 30 entradas e pode conter nomes, caminhos, horários e detalhes de clipes/projetos. Esses arquivos não são enviados automaticamente ao desenvolvedor.

O ícone de pasta informa o local dos dados. Faça backup da pasta inteira. **Remover** apenas arquiva o item; não apaga os arquivos salvos. Antes de compartilhar um diagnóstico ou print, confira nomes pessoais, dados de clientes, caminhos privados e conteúdo licenciado. Não publique sua biblioteca inteira em uma issue. O repositório e os pacotes públicos não incluem bibliotecas ou projetos de usuários.
