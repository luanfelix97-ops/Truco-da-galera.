# Truco da Galera — 1 contra 1

Jogo web de Truco Paulista para dois celulares, com sala privada, mãos mantidas no servidor e cartas privadas enviadas somente ao respectivo jogador.

## Como testar no computador
1. Instale Node.js 18 ou superior.
2. Extraia o ZIP.
3. No terminal, dentro da pasta, execute `npm install`.
4. Execute `npm start`.
5. Abra `http://localhost:3000`.

Para dois celulares em redes diferentes, publique o projeto em um serviço que aceite Node.js e WebSockets, como Render. Crie um repositório GitHub com estes arquivos e crie um Web Service apontando para ele:
- Build command: `npm install`
- Start command: `npm start`
- Runtime: Node
- Não precisa configurar variáveis de ambiente; a porta é lida de `PORT`.

Depois de publicar, abra o endereço HTTPS nos dois celulares. Uma pessoa toca em **Criar sala** e manda o código de 6 dígitos para a outra, que toca em **Entrar na sala**.

## Observações importantes
- Esta é uma primeira versão funcional/protótipo. As salas ficam em memória: se o servidor reiniciar, a partida é perdida.
- Não há conta ou senha; compartilhe o código da sala somente com a pessoa convidada.
- Não use para apostas em dinheiro.
- A lógica de pontuação e desempate é simplificada e deve ser testada antes de tratar como implementação oficial de regras de torneio.
- Para produção, recomenda-se adicionar reconexão, persistência, validação mais forte e testes automatizados.
