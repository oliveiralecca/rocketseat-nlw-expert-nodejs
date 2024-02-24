import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { FastifyInstance } from "fastify"
import { redis } from "../../lib/redis"

export async function getPoll(app: FastifyInstance) {
  app.get("/polls/:pollId", async (request, reply) => {
    const getPollParams = z.object({
      pollId: z.string().uuid(),
    })
  
    const { pollId } = getPollParams.parse(request.params)
  
    const poll = await prisma.poll.findUnique({
      where: {
        id: pollId,
      },
      include: {
        options: {
          select: {
            id: true,
            title: true
          }
        }
      }
    })

    if (!poll) {
      return reply.status(400).send({ message: "Poll not found." })
    }

    const result = await redis.zrange(pollId, 0, -1, "WITHSCORES") // traz a pontuação de todas (0 a -1) as opções daquela enquete no formato ['id', '0', 'id', '3']

    const votes = result.reduce((obj, item, index) => {
      if (index % 2 === 0) {
        const score = result[index + 1]

        Object.assign(obj, { [item]: Number(score) })
      }

      return obj
    }, {} as Record<string, number>) // transformando o array de retorno no result para um objeto onde os index pares do array são as chaves e os ímpares são os votos
    
    return reply.send({
      poll: {
        ...poll,
        options: poll.options.map(option => {
          return {
            ...option,
            score: (option.id in votes) ? votes[option.id] : 0, 
          }
        })
      }
    })
  })
}
