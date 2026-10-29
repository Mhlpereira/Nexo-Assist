import type { Article, User } from '@nexo/core'
import type { Sql } from './connection'

export const SEED_USERS: User[] = [
  { id: 'emp-ana', email: 'ana.souza@nexo.com.br', name: 'Ana Souza', role: 'employee', department: 'Financeiro', team: 'Controladoria' },
  { id: 'emp-carla', email: 'carla.mendes@nexo.com.br', name: 'Carla Mendes', role: 'employee', department: 'Financeiro', team: 'Contas a pagar' },
  { id: 'emp-bruno', email: 'bruno.tavares@nexo.com.br', name: 'Bruno Tavares', role: 'employee', department: 'Operações', team: 'Logística' },
  { id: 'emp-diego', email: 'diego.ramos@nexo.com.br', name: 'Diego Ramos', role: 'employee', department: 'Comercial', team: 'Vendas Sul' },
  { id: 'emp-elisa', email: 'elisa.prado@nexo.com.br', name: 'Elisa Prado', role: 'employee', department: 'Marketing', team: null },
  { id: 'emp-fabio', email: 'fabio.nunes@nexo.com.br', name: 'Fábio Nunes', role: 'employee', department: 'Jurídico', team: null },
  { id: 'emp-gabriela', email: 'gabriela.rocha@nexo.com.br', name: 'Gabriela Rocha', role: 'employee', department: 'RH', team: null },
  { id: 'ana-rafael', email: 'rafael.lima@nexo.com.br', name: 'Rafael Lima', role: 'analyst', department: 'Suporte N2', team: null },
  { id: 'ana-julia', email: 'julia.costa@nexo.com.br', name: 'Júlia Costa', role: 'analyst', department: 'Suporte N1', team: null },
]

export const SEED_ARTICLES: Article[] = [
  {
    slug: 'vpn-erro-809',
    title: 'VPN com erro 809',
    body: 'Erro 809 ao conectar na VPN: reinstale o cliente de VPN pelo Portal de Softwares e reinicie o computador. Se o erro continuar, abra um chamado.',
    appliesTo: 'Somente Windows 10. No Windows 11, abra um chamado.',
  },
  {
    slug: 'horario-service-desk',
    title: 'Horário do service desk',
    body: 'O service desk atende de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas. Telefone: ramal 4000.',
    appliesTo: null,
  },
  {
    slug: 'senha-rede-expirada',
    title: 'Senha da rede expirada ou esquecida',
    body: 'Para trocar ou recuperar a senha da rede, acesse senha.nexo.com.br pelo celular, confirme o código enviado por SMS e defina a nova senha. A senha nova vale para e-mail, VPN e Wi-Fi corporativo em até 15 minutos. Nunca informe sua senha a ninguém, nem ao service desk.',
    appliesTo: null,
  },
  {
    slug: 'wifi-visitantes',
    title: 'Wi-Fi para visitantes',
    body: 'Visitantes usam a rede Nexo-Visitantes. A senha do dia está na recepção e muda diariamente. Funcionários devem usar a rede Nexo-Corp com o login da rede.',
    appliesTo: null,
  },
  {
    slug: 'outlook-celular',
    title: 'Outlook não sincroniza no celular',
    body: 'No app Outlook do celular, vá em Configurações, toque na conta e escolha Redefinir conta. Se pedir, aprove o login no Microsoft Authenticator. Se continuar sem sincronizar depois de 30 minutos, abra um chamado.',
    appliesTo: 'iOS e Android com o app Outlook.',
  },
  {
    slug: 'impressora-fila-travada',
    title: 'Impressão presa na fila',
    body: 'Se a impressão ficar presa: abra Configurações > Impressoras, selecione a impressora, clique em Abrir fila e cancele todos os documentos. Depois, desligue e ligue a impressora. Se outras pessoas também não conseguem imprimir, abra um chamado informando o andar.',
    appliesTo: 'Impressoras corporativas dos escritórios.',
  },
  {
    slug: 'mfa-novo-celular',
    title: 'Autenticação em dois fatores em um celular novo',
    body: 'Trocou de celular? Acesse mfa.nexo.com.br no computador corporativo, entre com seu login e escolha Registrar novo dispositivo. Escaneie o QR code com o Microsoft Authenticator. Se perdeu o celular antigo e não consegue entrar, abra um chamado de Acesso com prioridade alta.',
    appliesTo: null,
  },
  {
    slug: 'solicitar-software',
    title: 'Como solicitar um software',
    body: 'Softwares da lista homologada (Office, Teams, Zoom, Power BI, 7-Zip) são instalados pelo Portal de Softwares, sem chamado. Softwares fora da lista precisam de requisição (REQ) na categoria Software, com a justificativa e a aprovação do gestor.',
    appliesTo: null,
  },
]

export async function seedDatabase(sql: Sql): Promise<void> {
  await sql`truncate messages, conversations, users, knowledge_articles cascade`
  for (const user of SEED_USERS) {
    await sql`insert into users (id, email, name, role, department, team)
              values (${user.id}, ${user.email}, ${user.name}, ${user.role}, ${user.department}, ${user.team})`
  }
  for (const article of SEED_ARTICLES) {
    await sql`insert into knowledge_articles (slug, title, body, applies_to)
              values (${article.slug}, ${article.title}, ${article.body}, ${article.appliesTo})`
  }
}
