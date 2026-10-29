// Tarefas longas (baixar jogo, instalar modpack...) com progresso para a interface.
// Uso:
//   const t = tarefas.criar('Instalando Sodium');
//   t.atualizar({ etapa: 'Baixando', feitos: 3, total: 10 });
//   t.concluir('Instalado!')   ou   t.falhar('Sem internet')
const { EventEmitter } = require('events');

const eventos = new EventEmitter();
const lista = new Map();
let contador = 0;
let agendado = null;

// Agrupa atualizações em rajada (downloads disparam milhares por segundo)
function avisar() {
  if (agendado) return;
  agendado = setTimeout(() => {
    agendado = null;
    eventos.emit('mudou', listar());
  }, 80);
}

function listar() {
  return [...lista.values()].map((t) => ({ ...t }));
}

function criar(titulo, extra = {}) {
  const id = `t${++contador}`;
  const tarefa = { id, titulo, etapa: '', feitos: 0, total: 0, estado: 'rodando', mensagem: '', ...extra };
  lista.set(id, tarefa);
  avisar();

  const encerrar = (estado, mensagem) => {
    Object.assign(tarefa, { estado, mensagem: mensagem || '' });
    avisar();
    // some da lista depois de um tempo (erros ficam mais para dar tempo de ler)
    setTimeout(() => { lista.delete(id); avisar(); }, estado === 'erro' ? 20000 : 6000);
  };

  return {
    id,
    atualizar({ etapa, feitos, total } = {}) {
      if (tarefa.estado !== 'rodando') return;
      if (etapa !== undefined) tarefa.etapa = etapa;
      tarefa.feitos = feitos || 0;
      tarefa.total = total || 0;
      avisar();
    },
    concluir: (mensagem) => encerrar('ok', mensagem),
    falhar: (mensagem) => encerrar('erro', mensagem),
  };
}

// Roda fn(tarefa) e fecha a tarefa sozinha. Devolve { ok, ...resultado } ou { ok:false, mensagem }.
async function executar(titulo, fn, extra) {
  const t = criar(titulo, extra);
  try {
    const resultado = await fn(t);
    t.concluir(resultado && resultado.mensagem);
    return { ok: true, ...(resultado || {}) };
  } catch (erro) {
    const mensagem = (erro && erro.message) || String(erro) || 'Algo deu errado.';
    t.falhar(mensagem);
    return { ok: false, mensagem };
  }
}

module.exports = { criar, executar, listar, eventos };
