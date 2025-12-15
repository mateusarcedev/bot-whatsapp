import axios from 'axios';

/**
 * Fetches address from CEP using ViaCEP
 */
export async function consultCep(cep: string): Promise<string> {
  const cleanCep = cep.replace(/\D/g, '');
  if (cleanCep.length !== 8) {
    throw new Error('Invalid CEP. Must contain 8 digits.');
  }

  try {
    const response = await axios.get(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (response.data.erro) {
      throw new Error('CEP não encontrado.');
    }
    const { logradouro, bairro, localidade, uf } = response.data;
    return `📍 *Endereço Encontrado:*\n${logradouro}, ${bairro}\n${localidade} - ${uf}\nCEP: ${cleanCep}`;
  } catch (error) {
    throw new Error('Erro ao consultar CEP.');
  }
}

/**
 * Expands shortened URLs and checks for basic suspicious patterns
 */
export async function checkLinkSafety(url: string): Promise<string> {
  try {
    // Expand URL (follow redirects)
    const response = await axios.head(url, { maxRedirects: 5, validateStatus: () => true });
    const finalUrl = response.request.res.responseUrl || url;

    const suspiciousDomains = ['ngrok', 'serveo', 'bit.ly', 'tinyurl']; // naive check
    const isSuspicious = suspiciousDomains.some(d => finalUrl.includes(d));

    let safetyMsg = `🔗 *Informações do Link*\nOriginal: ${url}\nDestino: ${finalUrl}`;

    if (isSuspicious) {
      safetyMsg += `\n\n⚠️ *Aviso:* O domínio de destino parece ser um encurtador ou genérico. Tenha cuidado.`;
    } else {
      safetyMsg += `\n\n✅ O destino parece normal (mas sempre verifique).`;
    }

    return safetyMsg;

  } catch (error) {
    return `❌ Erro ao verificar link: ${url}`;
  }
}
