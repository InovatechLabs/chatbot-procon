import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Iniciando a inserção de dados fictícios para os últimos 30 dias...');

  // Limpa registros anteriores
  await prisma.chatLog.deleteMany();
  await prisma.userSession.deleteMany();

  const now = new Date();
  const firstStep = await prisma.step.findFirst();
  const stepId = firstStep ? firstStep.id : undefined;

  for (let i = 30; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    const sessoesDoDia = Math.floor(Math.random() * 6) + 3; // 3 a 8 sessões por dia

    for (let j = 0; j < sessoesDoDia; j++) {
      // Garante unicidade usando o dia (i) e o índice (j) combinados com o número aleatório
      const telefoneFicticio = `55129${i.toString().padStart(2, '0')}${j.toString().padStart(2, '0')}${Math.floor(100 + Math.random() * 900)}`;

      // 1. Cria a sessão do usuário com telefone garantidamente único
      const session = await prisma.userSession.create({
        data: {
          phoneNumber: telefoneFicticio,
          currentStepId: stepId,
          updatedAt: date,
        },
      });

      // 2. Cria o log de entrada (INBOUND)
      await prisma.chatLog.create({
        data: {
          phoneNumber: telefoneFicticio,
          direction: 'INBOUND',
          messageText: 'Olá, preciso registrar uma reclamação no Procon.',
          timestamp: date,
          stepId: stepId,
        },
      });

      // 3. Cria o log de saída (OUTBOUND)
      await prisma.chatLog.create({
        data: {
          phoneNumber: telefoneFicticio,
          direction: 'OUTBOUND',
          messageText: 'Olá! Bem-vindo ao assistente virtual do PROCON...',
          timestamp: new Date(date.getTime() + 1000),
          stepId: stepId,
        },
      });
    }
  }

  console.log('✅ Dados dos últimos 30 dias inseridos com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro ao rodar seed de analytics:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });