This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Testes automatizados de implementação

- Para cada funcionalidade nova, mudança de comportamento ou correção no app, crie ou amplie testes automatizados que cubram os critérios de aceite. Versione esses testes junto com a alteração e execute-os antes de concluir o trabalho.
- Valide pelo caminho que a pessoa usa no app. Ao criar uma seção, por exemplo, navegue até a tela e verifique se a seção aparece e exibe os valores esperados. Se houver ação ou cálculo, execute a ação e confira o resultado no local em que ela deve surtir efeito, como o saldo, o orçamento ou a fatura. Se a mudança deve persistir, reabra e confira os dados salvos.
- Use dados de teste isolados e valores esperados definidos a partir do requisito. Nos fluxos financeiros, inclua um caso que detecte contagem duplicada ou aplicação no período incorreto quando esse risco existir. Nos testes de integração, use o banco e as regras do app, substituindo apenas dependências externas necessárias ao teste.
- Verifique que o teste falha pelo motivo esperado na versão sem a mudança ou, quando isso não for viável, com o comportamento testado temporariamente desativado em ambiente isolado. Depois confirme que passa com a implementação. Uma falha de configuração e um teste pulado não comprovam a cobertura.
- Informe os cenários e comandos executados, o resultado e as plataformas que foram validadas. Lint e verificação de tipos complementam os testes funcionais. Se um cenário essencial não puder ser executado, indique o bloqueio e mantenha a validação desse cenário pendente.

## Backups de versão

Antes de alterar uma versão entregue ou instalar uma atualização, preserve uma cópia do código-fonte da versão anterior e do APK exato entregue. Guarde o arquivo fora do projeto, verifique que ele abre e que o APK confere com o original. Mantenha os backups anteriores e exclua dos arquivos de versão os dados pessoais do aparelho e do navegador.

## Commits e publicação

- Ao concluir uma alteração autorizada, rode o lint e a verificação de tipos e crie automaticamente um commit local descritivo com os arquivos da própria tarefa. Preserve as alterações e os commits já feitos pelo usuário.
- Apresente o resumo, a branch, o identificador do commit e os resultados das verificações para revisão. Aguarde a autorização do usuário para enviar conteúdo ao GitHub, inclusive para criar ou atualizar um pull request.
- Após a autorização, publique no repositório `salbego611-cyber/APP-GASTOS`. Para atualizações após a primeira publicação, use uma branch de trabalho e um pull request para revisão da `main`.
- Mantenha APKs, chaves, credenciais, bancos locais, exportações financeiras e arquivos de backup fora do Git.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
