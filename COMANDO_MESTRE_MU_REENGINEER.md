# COMANDO MESTRE — MU-REENGINEER
## Engenharia reversa autorizada, reconstrução e modernização do cliente MU Online

/goal

A partir deste comando, você será o agente técnico executor responsável por conduzir o projeto MU-REENGINEER de ponta a ponta: pesquisar, auditar, planejar, desenvolver/reconstruir o CLIENTE e o SERVIDOR, integrar os componentes, testar, corrigir, medir desempenho e documentar tudo no repositório central até esgotar as tarefas tecnicamente executáveis.

MODO DE EXECUÇÃO: trabalhe continuamente por fases e subtarefas, sem parar depois de produzir apenas um plano ou relatório. Em cada ciclo, selecione a próxima tarefa concreta não bloqueada, faça a alteração real, execute verificações, corrija falhas encontradas, registre evidências e atualize a continuidade; em seguida, avance para a próxima tarefa automaticamente. Use as ferramentas reais disponíveis na Arena.ai. Não peça confirmação para decisões técnicas rotineiras, reversíveis e de baixo risco. Se o ambiente tiver limite de tempo, tokens, chamadas ou sessão, encerre o ciclo salvando o estado e deixando NEXT_TASK.md com uma próxima ação específica para retomada imediata. Não afirme que continuará rodando em segundo plano depois que a plataforma encerrar sua execução.

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


# 14. MODO DE EXECUÇÃO AUTÔNOMA CONTÍNUA — ARENA.AI

Esta seção tem prioridade operacional sobre qualquer comportamento que faça o agente parar após pesquisa, planejamento ou uma única alteração. O objetivo é executar trabalho real em ciclos sucessivos, respeitando limites da plataforma, segurança, licenças e permissões.

## 14.1. Ciclo obrigatório de trabalho

Repita o ciclo abaixo enquanto houver tempo, ferramentas e tarefas executáveis:

1. **Retomar:** leia AGENTS.md, README.md e os arquivos de continuidade. Confira branch, último commit, diff, arquivos não rastreados e estado do CI. Preserve trabalho existente.
2. **Selecionar:** escolha a tarefa de maior prioridade que tenha pré-requisitos disponíveis. Prefira tarefas pequenas que desbloqueiem build, testes, integração cliente-servidor ou medição de desempenho.
3. **Pesquisar com propósito:** consulte documentação oficial, código-fonte e issues relevantes. Registre links, versão, data de consulta, conclusões e incertezas. Não faça pesquisas repetidas sem uma pergunta técnica concreta.
4. **Implementar:** altere código, configuração, scripts, ferramentas ou documentação; não entregue apenas recomendações quando a alteração puder ser feita no ambiente.
5. **Validar:** execute os testes apropriados à alteração. Registre comandos, ambiente, resultado, logs relevantes e falhas. Não invente resultados.
6. **Corrigir:** se o teste falhar, diagnostique e tente corrigir. Reexecute os testes afetados e regressões relevantes. Não esconda falhas nem afrouxe testes apenas para obter aprovação.
7. **Revisar:** inspecione o diff, procure segredos, arquivos proprietários, binários inesperados, dependências desnecessárias e alterações destrutivas.
8. **Persistir:** atualize CURRENT_STATE.md, NEXT_TASK.md, CHANGELOG.md e os demais documentos afetados. Faça commits pequenos com mensagens claras quando Git estiver disponível e o conjunto estiver validado.
9. **Avançar:** se os critérios da tarefa forem atendidos, selecione automaticamente a próxima tarefa. Se não forem, continue corrigindo ou registre um bloqueio verificável e trabalhe em outra tarefa independente.
10. **Retomar sem perda:** ao iniciar uma nova sessão, continue de NEXT_TASK.md e do estado real do Git; não recomece desde a Fase 0 sem motivo.

Não considere uma pesquisa, uma lista de tarefas ou a criação de pastas como conclusão de desenvolvimento. Cada tarefa deve produzir um artefato, uma verificação ou uma decisão técnica sustentada por evidências.

## 14.2. Desenvolver o CLIENTE e o SERVIDOR no repositório central

O repositório central Otimizacao-cliente deve conter o código próprio, configurações, scripts de build, testes e documentação necessários para construir e validar a solução. Após auditar o estado existente, organize os componentes de forma clara, por exemplo:

- client/: cliente MU em desenvolvimento, integrações e configurações próprias.
- server/: servidor principal escolhido e código de integração/adaptação próprio.
- tools/: ferramentas de inspeção, conversão e diagnóstico.
- tests/: testes unitários, integração, protocolo, recursos e regressão.
- benchmarks/: cenários, scripts, resultados e instruções de medição.
- docs/ e project/: arquitetura, decisões, roadmap e continuidade.
- third_party/ ou submodules: referências externas fixadas em versões/commits conhecidos, se adequado.
- scripts/: automação reproduzível de configuração, build, teste e validação.

Essa estrutura é uma proposta, não uma ordem para duplicar repositórios ou mover código às cegas. Primeiro inspecione o conteúdo atual. Preserve atribuição, licença e histórico quando possível. Não copie o histórico inteiro nem todo o conteúdo de projetos externos para o repositório central sem justificativa. Prefira submodules ou scripts de preparação reproduzíveis quando apropriado.

**Cliente:** determine se a base xulek/muonline pode ser compilada e estendida legalmente. Identifique a parte que será reaproveitada, a parte que exige adaptação e a parte que precisará ser implementada. Se a base não atender ao objetivo, produza uma decisão técnica documentada e implemente um caminho incremental realista. Não alegue que o cliente foi recriado se apenas foi clonado.

**Servidor:** audite OpenMU e MuEmu, compare compatibilidade com o protocolo e as funcionalidades pretendidas, licenças, manutenção e capacidade de teste. Escolha e registre um servidor principal. Integre-o como componente versionado ou submodule, ou implemente/adapte os componentes necessários no diretório server/ conforme a licença e arquitetura. Não mantenha servidores concorrentes sem uma razão técnica testável. Não declare compatibilidade com Season 6/20 até demonstrar conexão e troca de mensagens compatíveis.

**Integração:** construa uma fatia vertical mínima e testável entre cliente e servidor: inicialização, conexão, negociação/protocolo quando aplicável, autenticação de teste segura, criação/seleção de sessão/personagem conforme suportado, troca de estado e desconexão limpa. Amplie o escopo progressivamente. Se a autenticação real exigir credenciais ou serviços externos, crie testes locais com dados fictícios e não simule sucesso contra um serviço real.

## 14.3. Ordem de prioridade e execução em paralelo

Priorize nesta ordem, reordenando somente com justificativa documentada:

1. Integridade do repositório, segurança, licenças e continuidade.
2. Build reproduzível de cada componente e ferramentas mínimas de diagnóstico.
3. Testes automatizados e correção dos bloqueios de build.
4. Carregamento de recursos e demonstração visual mínima do cliente.
5. Servidor selecionado compilável/inicializável e testes básicos de protocolo.
6. Integração cliente-servidor demonstrável.
7. Cobertura dos sistemas essenciais e tratamento de erros.
8. Benchmarks reproduzíveis, profiling e otimizações orientadas por métricas.
9. Testes de regressão, instalação limpa, documentação e pacote legalmente distribuível.

Quando possível, trabalhe em tarefas independentes sem criar conflitos de escrita. Não faça alterações simultâneas no mesmo arquivo. Não inicie várias tarefas que dependam de uma decisão ainda não validada.

## 14.4. Critérios de saída de cada tarefa/fase

Antes de marcar uma tarefa como concluída, confirme:
- O artefato esperado existe e foi inspecionado.
- O build/teste relevante foi realmente executado, ou a impossibilidade está claramente documentada.
- O resultado foi registrado com evidência suficiente para repetição.
- Não há falha crítica conhecida omitida do relatório.
- Documentação e NEXT_TASK.md refletem o estado atual.
- A próxima tarefa está selecionada.

Use estados inequívocos: NÃO INICIADO, EM ANDAMENTO, CONCLUÍDO COM EVIDÊNCIAS, BLOQUEADO EXTERNAMENTE, FALHOU ou NÃO APLICÁVEL COM JUSTIFICATIVA. Não use “concluído” para código apenas escrito e ainda não validado.

## 14.5. Escada de testes obrigatória

Execute o nível mais profundo permitido pelo ambiente:

- **Nível 1 — estático:** formatação, lint, análise estática, validação de configuração, verificação de segredos e dependências.
- **Nível 2 — unitário:** funções, parsers, serialização, estruturas de recursos e lógica isolada.
- **Nível 3 — integração local:** processos cliente/servidor, banco de dados se necessário, protocolo, carregamento de recursos e ciclo de sessão.
- **Nível 4 — ponta a ponta:** inicialização, conexão, fluxo essencial do usuário/personagem, movimentação suportada, desconexão e reinicialização.
- **Nível 5 — visual e recursos:** cenas e recursos representativos, arquivos ausentes/corrompidos, animações e regressão visual quando ferramentas permitirem.
- **Nível 6 — desempenho:** cenários repetíveis, FPS, p50/p95/p99 de frame time, stutter, CPU, GPU, RAM/VRAM, tempo de carregamento e duração do teste.
- **Nível 7 — ambiente real:** testar em hardware/sistema operacional reais e rede externa quando disponíveis. Se o agente não possuir essa capacidade, documente o roteiro exato e marque como PENDENTE DE VALIDAÇÃO HUMANA, sem alegar aprovação.

Sempre rode novamente os testes afetados após uma correção. Se uma suíte completa for demorada, rode primeiro o teste específico e depois a regressão mais ampla viável. Registre testes pulados e a razão.

## 14.6. Bloqueios: não parar o projeto inteiro

Quando uma tarefa for bloqueada por ausência de credenciais, dados, autorização, hardware, acesso à rede, limite da plataforma ou dependência indisponível:

1. Registre o erro exato e a evidência.
2. Confirme que o bloqueio é real e não um erro de configuração corrigível.
3. Procure alternativa segura, legal e tecnicamente válida.
4. Se houver alternativa, implemente-a e teste-a, sem fingir que é equivalente ao alvo bloqueado.
5. Se não houver alternativa, escreva em NEXT_TASK.md o que falta, quem precisa agir, o comando exato a executar e o resultado esperado.
6. Continue em tarefas independentes que não dependam desse bloqueio.
7. Não repita indefinidamente uma ação que falha pelo mesmo motivo sem nova hipótese ou mudança de condição.

Não peça autorização para decisões rotineiras e reversíveis. Exija confirmação antes de ações irreversíveis, publicação de conteúdo de licenciamento duvidoso, exclusão destrutiva, alteração de credenciais/permissões, compra de serviços ou operações que possam comprometer dados do usuário.

## 14.7. GitHub, commits e integridade

- Faça commits pequenos, com mensagem descritiva e vinculados a mudanças reais.
- Antes de editar, confira a branch e o estado do working tree; preserve alterações de outros agentes.
- Nunca sobrescreva silenciosamente alterações alheias nem use force push para contornar conflitos.
- Não comite tokens, senhas, chaves, dados pessoais, arquivos de jogo proprietários, dumps grandes, builds ou caches.
- Fixe dependências externas em versões/commits identificáveis e registre como inicializar os submodules.
- Se não houver permissão para publicar, mantenha as alterações locais e informe o que falta; não afirme que foi enviado ao GitHub.
- Se CI estiver disponível, acompanhe os resultados. Um commit publicado não equivale a build ou testes aprovados.

## 14.8. Relatório curto de cada ciclo

Ao encerrar um ciclo de trabalho, apresente:
- fase e tarefa atual;
- alterações concretas e commit/branch, se houver;
- comandos de validação realmente executados;
- testes aprovados, falhos, pulados e pendentes;
- bloqueios externos;
- próxima tarefa específica.

O relatório ao usuário deve ser conciso; o histórico técnico completo pertence aos arquivos do repositório.

## 14.9. Condição para continuar e condição de parada

Continue automaticamente enquanto existir ao menos uma tarefa segura, legal e executável no ambiente. Não pare porque o roadmap é longo, porque uma fase exige várias tentativas ou porque uma primeira tentativa falhou.

Encerre apenas quando:
- todos os critérios finais estiverem demonstrados; ou
- não houver mais nenhuma tarefa executável sem uma dependência externa essencial; ou
- o ambiente da Arena.ai estiver prestes a encerrar a execução e seja necessário persistir o estado.

Se uma dependência externa bloquear parte do projeto, finalize o ciclo com documentação completa e continue outras tarefas independentes. Quando a plataforma permitir nova execução, retome automaticamente de NEXT_TASK.md. Não prometa execução infinita ou em segundo plano se a plataforma não oferecer esse recurso.

**Instrução final de execução:** comece lendo o estado real do repositório. Depois, faça a primeira alteração útil, teste-a, registre o resultado e continue fase por fase. Não entregue apenas um plano. Não declare cliente, servidor, integração, compatibilidade, desempenho ou distribuição como concluídos sem evidências reproduzíveis.
