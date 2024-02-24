import { FastifyInstance } from "fastify";
import { voting } from "../utils/voting-pub-sub";
import { z } from "zod";

/*
* Pub/Sub -> Publish Subscribers
*   - conceito: Pattern muito utilizado em apps que lidam com eventos
*   - ex evento: toda vez que um usuário for inserido no banco, preciso enviar um e-mail
*   - os eventos são categorizados em canais: 
*     canal A -> 1, 2, 4, 7 (só os subscribers daquele canal ouvirão e receberão as mensagens postadas nele)
*/

export async function pollResults(app: FastifyInstance) {
  app.get("/polls/:pollId/results", { websocket: true }, (connection, request) => {
    // ouvir apenas as mensagens publicadas no canal com o ID da enquete (`pollId`)
    const pollResultsParams = z.object({
      pollId: z.string().uuid(),
    })

    const { pollId } = pollResultsParams.parse(request.params)

    voting.subscribe(pollId, (message) => {
      connection.socket.send(JSON.stringify(message))
    })
  })
}
