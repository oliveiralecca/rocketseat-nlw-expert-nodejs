import { z } from "zod"
import { randomUUID } from "crypto"
import { prisma } from "../../lib/prisma"
import { FastifyInstance } from "fastify"
import { redis } from "../../lib/redis"
import { voting } from "../../utils/voting-pub-sub"

export async function voteOnPoll(app: FastifyInstance) {
  app.post("/polls/:pollId/votes", async (request, reply) => {
    const voteOnPollBody = z.object({
      pollOptionId: z.string().uuid()
    })

    const voteOnPollParams = z.object({
      pollId: z.string().uuid()
    })
  
    const { pollId } = voteOnPollParams.parse(request.params) 
    const { pollOptionId } = voteOnPollBody.parse(request.body) 

    let { sessionId } = request.cookies // para identificar o usuário unicamente e permitir somente 1 voto por usuário

    if (sessionId) {
      const userPreviousVoteOnPoll = await prisma.vote.findUnique({
        where: {
          sessionId_pollId: {
            sessionId,
            pollId,
          }
        }
      })

      if (userPreviousVoteOnPoll && userPreviousVoteOnPoll.pollOptionId !== pollOptionId) {
        await prisma.vote.delete({
          where: {
            id: userPreviousVoteOnPoll.id,
          }
        }) // se o usuário está votando na mesma enquete, porém em opção diferente, deleta o voto anterior e na linha 53 está registrando o novo voto

        const votes = await redis.zincrby(pollId, -1, userPreviousVoteOnPoll.pollOptionId)

        voting.publish(pollId, {
          pollOptionId: userPreviousVoteOnPoll.pollOptionId,
          votes: Number(votes)
        })
      } else if (userPreviousVoteOnPoll) {
        return reply.status(400).send({ message: "You already voted on this poll." })
      }
    } // verifica se o usuário já votou em determinada enquete, para não deixar essa regra de negócio a cargo do DB (armazena dados)

    if (!sessionId) {
      sessionId = randomUUID()

      reply.setCookie("sessionId", sessionId, {
        path: "/", // todas as rotas do meu backend têm acesso
        maxAge: 60 * 60 * 24 * 30, // 30 dias
        signed: true, // seta o secret para proteger o cookie
        httpOnly: true, // esse cookie só vai poder ser acessado pelo backend da aplicação, o front não consegue acessar
      })
    } 

    await prisma.vote.create({
      data: {
        sessionId,
        pollId,
        pollOptionId,
      }
    })

    const votes = await redis.zincrby(pollId, 1, pollOptionId)

    voting.publish(pollId, {
      pollOptionId,
      votes: Number(votes)
    })
  
    return reply.status(201).send()
  })
}

// NOTE: parei no minuto 15
