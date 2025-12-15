# 🌍 Atlas Bot - WhatsApp Multi-Tool

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

Seu assistente pessoal no WhatsApp para downloads, conversões e utilitários. Rápido, seguro e 100% em Português.

## 🚀 Funcionalidades

*   **📱 Baixador de Mídia Universal**
    *   **YouTube**: Vídeo (MP4) ou Áudio (MP3/M4A) com menu interativo.
    *   **Redes Sociais**: Instagram, TikTok, Pinterest, Twitter/X (Download automático).
    *   *Suporte a arquivos grandes enviado como documento.*
*   **📄 Conversor de Arquivos**
    *   **PDF para Word**: Envie um PDF e receba um `.docx` editável.
*   **🛠️ Utilitários**
    *   `!cep [número]`: Consulta endereços brasileiros.
    *   `!check [link]`: Verifica se um site é seguro ou malicioso.
    *   `!menu`: Exibe a lista completa de comandos.
*   **🔒 Seguro**: Sistema de login via QR Code (Baileys) e limpeza automática de arquivos temporários.

## 📋 Pré-requisitos

*   **Node.js** (v18 ou superior)
*   **Python 3** (para `yt-dlp` e conversão de PDF) e `pip`
*   **FFmpeg** (Opcional, mas recomendado para melhor processamento de mídia)

## 🛠️ Instalação (Rodando Local)

1.  **Clone o repositório**
    ```bash
    git clone https://github.com/seu-usuario/atlas-bot.git
    cd atlas-bot
    ```

2.  **Instale as dependências**
    ```bash
    npm install
    # Instale dependências Python
    pip3 install yt-dlp pdf2docx
    ```

3.  **Configuração (.env)**
    Crie um arquivo `.env` na raiz:
    ```env
    # (Opcional) Banco de dados para salvar usuários
    SUPABASE_URL=sua_url
    SUPABASE_KEY=sua_chave

    # (Opcional) Caminho do yt-dlp se não estiver no PATH global
    YTDLP_PATH=/caminho/para/yt-dlp
    ```

4.  **Inicie o Bot**
    ```bash
    npm run dev
    # ou
    npx ts-node index.ts
    ```
    *Escaneie o QR Code que aparecerá no terminal com seu WhatsApp.*

## 🐳 Rodando com Docker (Recomendado)

Ideal para deixar rodando 24h em servidores (Oracle Cloud, VPS, etc).

1.  **Construa a imagem**
    ```bash
    docker build -t atlasbot .
    ```

2.  **Rode o container**
    ```bash
    docker run -d --restart always --env-file .env atlasbot
    ```

## ⚠️ Aviso Legal

Este projeto utiliza a biblioteca não-oficial `Baileys`. O uso automatizado do WhatsApp deve respeitar os Termos de Serviço da plataforma. Use com responsabilidade para evitar banimentos de conta.

---
Desenvolvido com ❤️ por **Mateus Arce** & **Antigravity**.
