# Bolso em Dia

Aplicativo em português do Brasil para registrar gastos e entradas, acompanhar o orçamento e usar contadores manuais. Feito com Expo, React Native, TypeScript, Expo Router e SQLite. O app instalado funciona offline, sem login. Os dados são guardados localmente e os valores são armazenados em centavos.

## Abrir no computador

Instale o Node.js 24 LTS ou superior e execute, na pasta do projeto:

```sh
npm ci
npm run web
```

Abra [http://localhost:8081](http://localhost:8081) no Edge ou Chrome e mantenha o terminal aberto. O comando exporta e serve a versão web localmente para carregar o SQLite no navegador. Execute-o novamente ao alterar o código. Use sempre o mesmo endereço, porta e perfil do navegador para acessar os mesmos dados. O banco web fica no armazenamento do navegador e é independente do banco do celular. Limpar os dados do site remove o banco web.

## Abrir no celular ou emulador

```sh
npm ci
npm start
```

Use o Expo Go com suporte ao SDK do projeto e escaneie o QR code pela rede local. Para o emulador Android, inicie um dispositivo virtual no Android Studio e pressione **a** no terminal, ou execute `npm run android`. No macOS, abra o simulador pelo Xcode e pressione **i**, ou execute `npm run ios`. Caso o Expo Go disponível use outro SDK, compile o app localmente com `npx expo run:android` ou, no macOS, `npx expo run:ios`.

## Gerar um APK local para Android

Instale o Android Studio, o SDK indicado pela [referência do Expo](https://docs.expo.dev/versions/v57.0.0/) e um JDK 17. Configure o SDK conforme o [guia de ambiente para compilação local](https://docs.expo.dev/get-started/set-up-your-environment/).

```powershell
npm ci
npx expo prebuild --platform android
Set-Location android
.\gradlew.bat assembleRelease
```

O APK fica em `android/app/build/outputs/apk/release/app-release.apk`. Na configuração gerada pelo Expo, o APK usa a chave de depuração para instalação local. Instale com `adb install -r app/build/outputs/apk/release/app-release.apk` a partir da pasta `android`, ou transfira o APK para o aparelho e instale pelo gerenciador de arquivos. A versão release inclui o JavaScript no APK e abre sem o Metro. No macOS ou Linux, use `./gradlew assembleRelease`.

Para distribuição no Google Play, use sua própria chave, configure a assinatura de release e gere o AAB com `gradlew bundleRelease`. Consulte o [guia de release local do Expo](https://docs.expo.dev/guides/local-app-production/).

## Compilar para iOS

Em um Mac com Xcode e CocoaPods, rode `npm ci` e `npx expo run:ios --configuration Release` para executar em um simulador. Para um iPhone físico, use a opção `--device` e configure a assinatura no Xcode. Para TestFlight ou App Store, gere um Archive no Xcode e use uma conta do Apple Developer Program. São requisitos de assinatura e distribuição da Apple. O aplicativo em si funciona sem conta.

## Uso e verificações

- **Início** mostra o saldo disponível com os lançamentos confirmados e o saldo previsto com os valores ainda em aberto. Pagamentos de fatura afetam o caixa no dia informado. As compras continuam no orçamento do período em que a fatura vence. Toque no mês para consultar os resultados de 12 meses de cada vez.
- **Lançamentos** permite buscar por descrição, categoria ou forma de pagamento. Para confirmar uma entrada ou despesa, abra-a e altere a situação para **Recebido** ou **Pago**. Na criação, use **Repetir mensalmente** para gerar de 2 a 60 ocorrências, incluindo a primeira. As próximas ficam pendentes. Uma recorrência iniciada no dia 31 usa o último dia nos meses mais curtos.
- **Contador** salva cada toque e permite desfazer o último incremento ou decremento. Valores negativos são permitidos.
- **Ajustes** inclui tema, início do período de 1 a 28 e exclusão de dados. Por exemplo, com início no dia 10, o período de junho vai de 10/06 a 09/07. Alterar o dia redefine os intervalos por data e mantém os limites associados ao mês em que cada período começa.
- **Economias e Investimentos** ficam no Início e permitem registrar valores guardados, aportes e retiradas. O total de investimentos soma os aportes e desconta as retiradas registradas. Os lançamentos do orçamento são acompanhados à parte.
- **Perfil financeiro**, em Ajustes, mostra a parcela da renda recebida que foi gasta no período, onde ela foi usada e qual percentual foi destinado a depósitos e aportes.
- **Cartões de crédito**, em Ajustes, permite cadastrar os dias de fechamento e vencimento. Compras registradas a partir do dia de fechamento entram na fatura seguinte. Em meses mais curtos, dias acima do último dia do mês são ajustados para ele. Gastos e parcelas entram no período do vencimento. Use **Cartões de crédito** para registrar que a fatura foi paga.
- **Compras e pagamentos no crédito** são lançados como gastos com a forma de pagamento **Crédito**. Na tela de cartões, use **Registrar pagamento** para informar quanto pagou da fatura e em que data. O histórico de cada fatura mostra os pagamentos e o valor que ainda falta. Depois de salvar um pagamento ou excluir um lançamento individual, o botão **Desfazer** fica disponível por alguns segundos.
- **Parcelar fatura** registra os termos de um acordo já contratado. Informe a quantidade de parcelas, o valor de cada uma e o primeiro vencimento. Os gastos originais ficam no histórico, a parte já paga continua no orçamento original e as parcelas substituem o saldo pendente nas previsões. A estimativa de limite disponível considera os valores em aberto. Estornos são créditos no período da fatura correspondente.
- **Vencimentos** na tela inicial reúne contas e faturas atrasadas e dos próximos sete dias. Os lembretes no Android e iOS são opcionais e dependem da permissão de notificações do aparelho.
- **Favoritos** reaproveitam categoria, forma de pagamento e descrição. Em **Economias**, crie metas e vincule aportes ou retiradas. Em **Lançamentos**, use **Exportar CSV** para abrir os registros do período no Excel.

```sh
npm run typecheck
npx expo lint
npx expo-doctor
```

Cada instalação tem seu próprio banco. Em **Ajustes → Backup**, salve um backup em JSON e guarde o arquivo onde preferir. A tela mostra a data da última exportação. No Android e iOS você pode ativar um lembrete local para fazer uma nova cópia após 30 dias. Para transferir o histórico a outro aparelho, copie o arquivo e restaure o backup no novo aparelho. A restauração substitui os dados atuais dessa instalação. Use uma aba do navegador por vez para acessar o banco web.
