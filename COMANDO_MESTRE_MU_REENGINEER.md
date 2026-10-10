# COMANDO MESTRE — MU-REENGINEER
## Engenharia reversa autorizada, reconstrução e modernização do cliente MU Online

/goal

A partir deste comando, você será o responsável técnico por conduzir o projeto MU-REENGINEER, desde a preparação inicial dos repositórios até o desenvolvimento, a integração e a validação de um cliente MU Online moderno, otimizado e funcional.

Trabalhe de maneira contínua, organizada, técnica e orientada por evidências. Sempre que houver ferramentas e permissões disponíveis, examine os repositórios, leia o código existente, execute as ações possíveis, implemente alterações, rode testes e registre resultados reais.

Não afirme que modificou arquivos, executou testes, baixou recursos ou publicou alterações sem que isso tenha efetivamente ocorrido. Quando uma ação depender de acesso ao computador local, credenciais, autorização ou operação que você não consegue executar, prepare instruções e comandos exatos para o usuário e continue a partir dos resultados apresentados.

---

# 1. OBJETIVO PRINCIPAL

Construir um cliente MU Online moderno e altamente otimizado, aproveitando como referência técnica o código aberto disponível, os formatos dos recursos do jogo e os comportamentos que possam ser estudados legalmente.

Não se trata apenas de instalar ou executar um cliente existente. O objetivo é desenvolver e validar progressivamente uma implementação com:

- Renderização 3D moderna e eficiente.
- FPS elevado e estável e frame times consistentes.
- Redução de travamentos e picos de latência.
- Melhor aproveitamento de CPU e GPU.
- Gerenciamento eficiente de memória.
- Carregamento otimizado de mapas, personagens, objetos e texturas.
- Animações fluidas e câmera responsiva.
- Gerenciamento eficiente de efeitos visuais e partículas.
- Compatibilidade com recursos do MU Online tecnicamente adequados.
- Preservação da identidade visual clássica.
- Arquitetura modular, documentada e testável.
- Ferramentas de inspeção, validação e diagnóstico.
- Processo reproduzível de compilação, execução e benchmark.
- Possibilidade de integração com um servidor compatível.

A meta é obter melhorias mensuráveis sem sacrificar estabilidade, fidelidade visual ou funcionalidade. Não prometa FPS específico antes de medições reproduzíveis.

# 2. CLIENTE DE REFERÊNCIA: MU RED SEASON 20

A versão de referência escolhida para a pesquisa de recursos é MU Red Season 20, versão 1.20.61.

Repositório técnico:
https://github.com/xulek/muonline

Pacote de dados indicado pelo repositório:
https://full-wkr.mu.webzen.co.kr/muweb/full/MU_Red_1_20_61_Full.zip

Diretório local sugerido:
D:\MU-REENGINEER-DATA\

O MU Red será usado como referência técnica e fonte local de dados para pesquisa e desenvolvimento, não como substituto automático do cliente final que estamos construindo. Confirme a disponibilidade do download, procedência, integridade, segurança e tamanho real do arquivo. Não invente valores nem presuma que o link continua ativo.

## 2.1. Finalidade do MU Red

Utilize os arquivos disponíveis e compatíveis para:

1. Estudar a estrutura dos diretórios e formatos dos recursos.
2. Investigar modelos 3D BMD.
3. Estudar esqueletos, animações, personagens, monstros e equipamentos.
4. Inspecionar texturas e materiais.
5. Investigar mapas, terrenos, objetos e ambiente.
6. Estudar efeitos visuais, partículas, sons e interfaces.
7. Criar ferramentas de inspeção e diagnóstico.
8. Verificar como os recursos podem ser carregados por uma implementação própria.
9. Identificar limitações dos formatos antigos.
10. Projetar pipelines eficientes de carregamento, cache e renderização.
11. Comparar a fidelidade visual do cliente em desenvolvimento com a referência.
12. Construir testes reproduzíveis de qualidade e desempenho.
13. Identificar somente os arquivos realmente necessários para cada funcionalidade.

O código aberto e os recursos proprietários podem ter licenças diferentes. A disponibilidade de um arquivo não concede automaticamente permissão para redistribuição, modificação ou publicação. Não inclua recursos proprietários em releases públicos sem autorização apropriada.

Se o download falhar, não substitua automaticamente o pacote por um executável desconhecido. Pesquise alternativas com procedência verificável e avalie segurança e condições de utilização antes de recomendar instalação. Não execute instaladores ou binários desconhecidos sem avaliação.

# 3. COMPATIBILIDADE SEASON 20 / SEASON 6

O repositório xulek/muonline documenta uma arquitetura que combina recursos de cliente Season 20 (1.20.61) com protocolo de rede Season 6 e indica a necessidade de um patch de dados S6. Confirme isso diretamente no README e no código atuais antes de agir.

Antes de aplicar qualquer patch:

- Identifique a versão exata dos recursos esperados.
- Localize os patches documentados.
- Examine os arquivos que serão alterados.
- Verifique diferenças entre dados S20 e S6.
- Documente riscos e dependências.
- Identifique as funcionalidades afetadas.
- Defina testes de validação.

Não substitua arquivos indiscriminadamente. Não suponha que mapas, itens, personagens, efeitos, animações ou interfaces de S20 funcionarão corretamente com protocolo S6. Compatibilidade visual, compatibilidade de arquivos e compatibilidade de rede são problemas diferentes e devem ser testados separadamente.

# 4. REPOSITÓRIOS DE REFERÊNCIA

## 4.1. Cliente
https://github.com/xulek/muonline

Audite a arquitetura, pipeline de renderização, carregamento de recursos, limitações, estado do código e componentes reutilizáveis. Não presuma que esteja completo ou pronto para produção.

## 4.2. Servidor OpenMU
https://github.com/MUnique/OpenMU

Investigue autenticação, conexões, protocolo, movimentação, entidades, combate, persistência, sessões e regras de jogo. Verifique a compatibilidade real com a versão do cliente antes de escolhê-lo como servidor principal.

## 4.3. Ferramentas BMD
https://github.com/xulek/muonline-bmd-viewer

Use para inspecionar modelos, texturas, animações, personagens, equipamentos, mapas e terrenos quando suportados. Confirme funcionalidades no código; não presuma que seja um editor completo ou que suporte todos os formatos.

## 4.4. Servidor alternativo MuEmu
https://github.com/Yomalex/MuEmu

Mantenha como alternativa para comparação de protocolo, regras, versões, arquitetura, licença e integração. Não execute dois servidores como componentes principais sem necessidade demonstrada.

A escolha do servidor principal deve ser justificada por compatibilidade, estabilidade, manutenção, recursos, licença e facilidade de teste.

# 5. REPOSITÓRIO E ARMAZENAMENTO

O repositório central é:
https://github.com/heldergaraujo2/Otimizacao-cliente

Os tamanhos inicialmente reportados pela API do GitHub foram:
- xulek/muonline: 29,65 MB.
- MUnique/OpenMU: 99,45 MB.
- xulek/muonline-bmd-viewer: 2,72 MB.
- Yomalex/MuEmu: 5,34 MB.
- Soma aproximada: 137,16 MB.

Esses valores não representam o tamanho completo de um cliente instalado, checkout local, histórico, dependências ou build. Um cliente com mapas, modelos, texturas, sons e outros recursos pode ocupar vários gigabytes.

Não crie vários repositórios novos sem necessidade técnica. Prefira um repositório central e referências aos projetos externos. Se usar Git submodules, registre endereços e commits específicos e documente clonagem e atualização reprodutíveis. Separe código próprio de dependências externas.

Estrutura inicial proposta, adaptável após auditoria:
- AGENTS.md
- README.md
- .gitignore
- .gitmodules, se necessário
- docs/
- project/
- scripts/
- tools/
- client/
- server/
- tests/
- benchmarks/
- third_party/
- assets-local/
- build/

Não crie diretórios vazios apenas para aparentar progresso.

Mantenha os recursos do jogo fora do Git, preferencialmente em D:\MU-REENGINEER-DATA\. Configure .gitignore para impedir inclusão acidental de recursos locais, builds, caches, executáveis e arquivos temporários. Avalie o tamanho dos downloads, espaço para extração e requisitos de execução. Não use Git LFS automaticamente como depósito de um cliente completo; avalie limites e cotas. Distribua builds separadamente do código, quando legalmente permitido.

# 6. CONTINUIDADE OBRIGATÓRIA

Mantenha no repositório:
- AGENTS.md
- README.md
- project/CONTEXT.md
- project/CURRENT_STATE.md
- project/DECISIONS.md
- project/NEXT_TASK.md
- project/CHANGELOG.md
- docs/ROADMAP.md
- docs/ARCHITECTURE.md
- docs/REPOSITORIES.md
- docs/ASSET_PIPELINE.md
- docs/BUILD_AND_RUN.md
- docs/TEST_STRATEGY.md
- docs/PERFORMANCE.md
- docs/COMPATIBILITY.md
- docs/SECURITY_AND_LICENSES.md

Adapte a documentação conforme necessário, mas preserve as informações essenciais.

CONTEXT.md: objetivo, arquitetura, decisões, repositórios, relação entre cliente, recursos e servidor e restrições.
CURRENT_STATE.md: o que funciona, o que foi implementado e testado, resultados, problemas, bloqueios e estado real de cada componente.
DECISIONS.md: decisões, alternativas, justificativas, consequências e questões pendentes.
NEXT_TASK.md: próxima tarefa concreta, prioridade, pré-requisitos, arquivos relevantes, passos, critérios de conclusão e comandos de validação.
CHANGELOG.md: alterações, correções, testes, resultados e limitações.
ROADMAP.md: fases, objetivos, dependências, critérios de conclusão e estado real.

Ao iniciar cada sessão:
1. Leia AGENTS.md e README.md.
2. Leia CONTEXT.md, CURRENT_STATE.md, DECISIONS.md, NEXT_TASK.md e CHANGELOG.md.
3. Leia o roadmap e documentos relevantes.
4. Inspecione o estado atual do Git e alterações pendentes.
5. Confirme o que está concluído e a próxima tarefa.

Não reinicie etapas concluídas sem justificativa. Não trate tarefas planejadas como executadas.

Após cada tarefa relevante, atualize a documentação, execute testes, registre resultados, atualize NEXT_TASK.md, CURRENT_STATE.md e CHANGELOG.md. Faça commit somente de alterações validadas; publique no GitHub quando houver autorização e acesso. Confirme o estado real. Nunca grave credenciais, tokens ou segredos.

# 7. ROADMAP

Avance automaticamente quando os critérios objetivos da fase atual estiverem satisfeitos. Não peça confirmação para decisões técnicas rotineiras e reversíveis; documente-as. Não ultrapasse bloqueios que exijam intervenção do usuário, autorização, credenciais, acesso físico ou confirmação de ação irreversível.

## FASE 0 — Auditoria inicial
Audite todos os repositórios, READMEs, licenças, linguagens, frameworks, dependências, atividade, compatibilidade, ferramentas e riscos. Entregue relatório, inventário, matriz de compatibilidade, plano e bloqueios. Conclusão: decisões iniciais sustentadas por evidências.

## FASE 1 — Preparação do repositório
Prepare o repositório central, Git, documentação, .gitignore, submodules quando apropriado, versões de dependências e instruções reproduzíveis. Conclusão: outro desenvolvedor consegue clonar e compreender o projeto.

## FASE 2 — Dados Season 20
Verifique pacote, origem, integridade e segurança; registre tamanho real; organize diretório; extraia controladamente; inventarie formatos e arquivos; mantenha dados fora do Git. Se bloqueado, documente e pesquise alternativa legítima. Conclusão: dados organizados e inspecionáveis, sem distribuição indevida.

## FASE 3 — Compilação do cliente de referência
Prepare ambiente, dependências e build; configure caminhos de dados; compile, execute quando possível e registre erros. Compilação e execução são validações separadas. Conclusão: build reproduzível e execução documentada ou bloqueio precisamente identificado.

## FASE 4 — Ferramentas de recursos
Prepare e execute BMD Viewer e ferramentas necessárias; inspecione personagens, equipamentos, modelos, texturas, mapas e animações conforme suportados. Conclusão: fluxo de inspeção repetível.

## FASE 5 — Arquitetura do cliente otimizado
Mapeie arquitetura e gargalos; defina renderer, abstrações, gerenciamento de recursos, ciclo de vida, carregamento assíncrono quando adequado, cache, memória, métricas e separação entre renderização, lógica e rede. Avalie OpenGL, DirectX 11 e alternativas com justificativa. Conclusão: arquitetura documentada e plano verificável.

## FASE 6 — Pipeline de recursos
Implemente ou melhore carregadores e validadores; detecte arquivos ausentes, corrompidos ou incompatíveis; evite duplicação em memória; avalie cache e formatos de GPU quando apropriado; preserve fidelidade visual. Conclusão: carregamento consistente e erros diagnosticáveis.

## FASE 7 — Renderer e cena 3D
Construa ou otimize renderer, modelos, texturas, transformações e câmera; investigue batching, draw calls, culling, LOD, materiais, iluminação, sombras e efeitos conforme benefício medido. Conclusão: cena representativa correta com métricas.

## FASE 8 — Personagens e animações
Valide personagens, esqueletos, animações, equipamentos, transições, movimentação, rotação e troca de recursos. Meça CPU/GPU e corrija artefatos. Conclusão: personagens representativos funcionando sem erros críticos conhecidos.

## FASE 9 — Mapas e ambiente
Carregue terrenos e mapas suportados, objetos, colisões quando aplicável e transições; otimize visibilidade, carregamento e memória. Conclusão: cenário representativo validado e medido.

## FASE 10 — Rede e servidor
Audite protocolo, mensagens e estados; avalie OpenMU e MuEmu; integre com documentação; valide login, sessão, estado do personagem e movimentação conforme suportados; trate desconexões e erros; mantenha servidor autoritativo. Não deduza compatibilidade apenas pela menção a Season 6. Conclusão: comunicação funcional demonstrada ou limitações documentadas.

## FASE 11 — Sistemas de jogo
Inventarie sistemas necessários, existentes e ausentes; priorize funcionalidades essenciais; valide estados de jogo e integração com servidor; teste movimentação, personagens, inventário, equipamentos e demais sistemas dentro do escopo. Evite reimplementar sistemas que funcionam sem motivo. Conclusão: funcionalidades priorizadas testadas.

## FASE 12 — Desempenho
Crie cenários de benchmark e meça FPS médio, percentis de frame time, picos, stuttering, CPU, GPU, memória e carregamento. Compare configurações, investigue gargalos, altere uma variável por vez e repita testes. Documente resolução, hardware e condições. Não invente resultados. Conclusão: relatório reproduzível com melhorias e regressões.

## FASE 13 — Validação e distribuição
Compile versão validada, execute regressões, verifique dependências, teste instalação limpa, inicialização, carregamento, encerramento, configurações e logs; confirme licenças e condições de distribuição; prepare documentação e pacote somente quando permitido. Conclusão: versão reproduzível, testada e documentada.

Não marque fases concluídas apenas porque comandos foram executados; exija evidências.

# 8. ESTRATÉGIA DE TESTES

## Compilação
Teste cliente, ferramentas, servidor, dependências e reprodutibilidade do build.

## Recursos
Teste abertura e integridade de arquivos, modelos, texturas, animações, mapas, detecção de ausências e tratamento de incompatibilidade.

## Visual
Teste personagens, equipamentos, animações, terrenos, objetos, iluminação, efeitos, câmera, interface e transições.

## Desempenho
Teste cena vazia, um personagem, vários personagens, efeitos, ambiente complexo, troca de mapa, carregamento inicial e sessão prolongada. Registre FPS médio, método do mínimo observado, p50/p95/p99 de frame time, carregamento, memória, CPU, GPU e erros quando disponíveis.

## Rede
Teste conexão, autenticação, sessão, movimentação, mensagens, latência, perda de conexão, reconexão, estados inconsistentes e autoridade do servidor.

Uma simulação local não equivale a teste real de rede.

# 9. SEGURANÇA, LICENÇAS E INTEGRIDADE

Antes de integrar código ou recursos de terceiros, identifique licença, condições, origem, componentes proprietários e dependências vulneráveis. Evite executar binários desconhecidos, não grave credenciais no Git e não publique arquivos protegidos sem autorização. Código aberto não significa que recursos proprietários do jogo podem ser redistribuídos.

Priorize ferramentas de inspeção e implementações próprias quando permitirem atingir o objetivo sem distribuir conteúdo não autorizado.

# 10. REGRAS DE TRABALHO AUTÔNOMO

1. Não reinicie o projeto do zero sem justificativa.
2. Não descarte alterações existentes sem examiná-las.
3. Não reescreva componentes funcionais sem necessidade.
4. Não adicione funcionalidades desconectadas do objetivo.
5. README não prova que o software funciona.
6. Compilação não prova compatibilidade completa.
7. Demonstração visual não prova desempenho superior.
8. Documente bloqueios críticos.
9. Prefira mudanças pequenas, verificáveis e reversíveis.
10. Mantenha o projeto compilável quando possível.
11. Registre comandos e resultados importantes.
12. Preserve dados locais e alterações não commitadas.
13. Não faça force push nem operações destrutivas sem necessidade e autorização.
14. Não declare tarefas concluídas sem evidências.
15. Execute o próximo passo ao seu alcance; não pare apenas no planejamento.
16. Não peça que o usuário indique a próxima fase quando os critérios objetivos já estiverem satisfeitos.
17. Se houver bloqueio de ação local, forneça comando exato e resultado esperado.
18. Após receber a saída, continue sem repetir trabalho desnecessário.

Autonomia respeita limites de acesso, segurança, licenciamento e integridade.

# 11. PRIMEIRA EXECUÇÃO

Ao receber este comando:

1. Leia todas as instruções.
2. Verifique se o repositório Otimizacao-cliente existe e se contém arquivos.
3. Se estiver vazio, prepare a estrutura inicial; se já tiver conteúdo, audite antes de modificar.
4. Examine os quatro repositórios de referência.
5. Leia READMEs e licenças.
6. Determine requisitos de compilação.
7. Verifique ferramentas disponíveis.
8. Defina estratégia de clonagem e integração.
9. Crie ou atualize os arquivos de continuidade.
10. Monte matriz de compatibilidade entre cliente, dados S20 e servidor.
11. Verifique disponibilidade do pacote MU Red 1.20.61.
12. Não baixe nem execute arquivos sem avaliar origem e segurança.
13. Prepare a primeira tarefa de implementação baseada na auditoria.
14. Execute a primeira tarefa que não dependa de bloqueios externos.
15. Rode os testes disponíveis.
16. Registre resultados reais.
17. Atualize NEXT_TASK.md.

Se não puder criar repositórios ou executar comandos locais, não simule essas operações. Forneça instruções executáveis e prossiga com a análise possível.

# 12. RELATÓRIO DE CADA ETAPA

Ao concluir uma etapa relevante, informe:
- **Fase atual:** número e nome.
- **Objetivo:** o que deveria alcançar.
- **Alterações realizadas:** arquivos e módulos modificados.
- **Testes executados:** comandos e cenários realmente testados.
- **Resultados:** aprovações, falhas e métricas observadas.
- **Problemas conhecidos:** limitações restantes.
- **Decisões tomadas:** justificativas técnicas.
- **Próxima tarefa:** ação concreta.
- **Continuidade:** documentação atualizada.

Destaque mudanças desde a última etapa e mantenha o estado completo no repositório.

# 13. DEFINIÇÃO DE SUCESSO

O projeto será considerado concluído quando houver evidências de que:
- O código está organizado e documentado.
- Dependências estão identificadas.
- O cliente pode ser compilado e executado conforme o escopo.
- Recursos necessários carregam corretamente.
- Sistemas visuais prioritários funcionam.
- Compatibilidade de rede foi validada quando fizer parte do escopo.
- Testes essenciais foram executados.
- Desempenho foi medido em cenários reproduzíveis.
- Otimizações demonstraram resultados reais.
- Regressões relevantes foram tratadas ou documentadas.
- O ambiente pode ser reproduzido.
- Condições de utilização e distribuição estão documentadas.
- Um novo chat consegue retomar o projeto sem depender desta conversa.

O objetivo final é desenvolver um cliente MU Online moderno, eficiente, tecnicamente verificável e visualmente fiel aos recursos que possamos utilizar legalmente.

**Comece pela auditoria do estado real do repositório e do ambiente. Depois, avance automaticamente pelas tarefas prontas, mantendo resultados e continuidade registrados no GitHub.**
