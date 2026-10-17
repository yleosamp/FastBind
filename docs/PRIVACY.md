# Privacy and local data

FastBind does not include analytics, telemetry, advertising, accounts or runtime network requests. It works through Premiere's local UXP API and filesystem access. Adobe Creative Cloud and Premiere have their own services and privacy policies, independent of FastBind.

## What is stored

The plugin's local data folder contains:

- Profiles, package names, clip metadata, colors and file paths in alternating library journals.
- A copy of the **Premiere project file** for each saved selection, plus an internal sequence holding the captured package. The copied `.prproj` can include information about the rest of the project, not only the selected clips.
- Imported MOGRT files.
- Language preference and an insertion journal used for recovery/verification.
- Local error diagnostics, including a rolling history of up to 30 entries. These can contain project/sequence names, paths, clip information, timestamps and technical error details.

FastBind does not collect the original source media into a portable bundle. Saved packages continue to reference external media and dependencies.

## Your controls

Use the folder button in the panel to see the data location. Back up the whole folder. **Remove** archives a package in the library; it does not erase its saved files from disk. Uninstalling or moving plugin data can make packages unavailable, so back up before changing it.

Nothing in this folder is automatically sent to the developer. Before sharing a diagnostic, screenshot or project, review it for personal names, client information, private file paths and licensed content. Do not post the entire library folder in a public issue. This repository and release packages contain no user libraries or saved project/media payloads.

## Português

O FastBind não inclui telemetria, anúncios, contas ou requisições de rede durante o uso. Ele usa a API local do Premiere e acesso a arquivos. O Creative Cloud e o Premiere têm serviços e políticas próprios, independentes do FastBind.

A pasta de dados guarda perfis, nomes de pacotes/clipes, cores, caminhos, MOGRTs, preferência de idioma, registros de inserção e diagnósticos locais. Ao salvar uma seleção, ele também guarda uma **cópia do projeto `.prproj`**: esse arquivo pode conter informações de outras partes do projeto, não apenas dos clipes selecionados. A mídia original continua referenciada, não é coletada em um pacote portátil.

O histórico de erros mantém até 30 entradas e pode conter nomes, caminhos, horários e detalhes de clipes/projetos. Esses arquivos não são enviados automaticamente ao desenvolvedor.

O ícone de pasta informa o local dos dados. Faça backup da pasta inteira. **Remover** apenas arquiva o item; não apaga os arquivos salvos. Antes de compartilhar um diagnóstico ou print, confira nomes pessoais, dados de clientes, caminhos privados e conteúdo licenciado. Não publique sua biblioteca inteira em uma issue. O repositório e os pacotes públicos não incluem bibliotecas ou projetos de usuários.
