import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
const connectionString = process.env.DATABASE_URL || 'postgresql://procon_admin:senha_secreta_123@postgres:5432/procon_db?schema=public';
const pool = new pg.Pool({ connectionString });
async function main() {
    console.log('Iniciando o povoamento da tabela Step...');
    const cdcPath = path.join(process.cwd(), 'src/database/data/cdcData.json');
    if (!fs.existsSync(cdcPath)) {
        console.error(`Arquivo cdcData.json não foi encontrado em: ${cdcPath}`);
        return;
    }
    const cdcRaw = fs.readFileSync(cdcPath, 'utf-8');
    const cdcNodes = JSON.parse(cdcRaw);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < cdcNodes.length; i++) {
            const node = cdcNodes[i];
            // Garante um ID válido extraído do nó ou gera um UUID
            const nodeId = node.id || node.stepId || node.nodeId || randomUUID();
            const isStart = i === 0 || node.noPaiId === null || node.parentId === null;
            const query = `
        INSERT INTO "Step" (id, title, message, "isStart")
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          message = EXCLUDED.message,
          "isStart" = EXCLUDED."isStart";
      `;
            await client.query(query, [
                String(nodeId),
                node.titulo || node.title || 'Sem título',
                node.textoMensagem || node.content || node.message || '',
                isStart,
            ]);
        }
        await client.query('COMMIT');
        console.log(`Sucesso! ${cdcNodes.length} registros inseridos na tabela "Step".`);
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao inserir dados no banco:', error);
        process.exit(1);
    }
    finally {
        client.release();
        await pool.end();
    }
}
main();
//# sourceMappingURL=seed.js.map