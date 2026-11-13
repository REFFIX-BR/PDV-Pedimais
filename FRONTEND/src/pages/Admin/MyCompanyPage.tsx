/**
 * Arquivo: src/pages/Admin/MyCompanyPage.tsx
 * Objetivo: centraliza configurações cadastrais e de contato da empresa.
 * Entradas esperadas: não recebe props; renderiza formulário de dados institucionais.
 */
import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/Admin/PageHeader";
import { SearchableSelectField, YesNoSegmentedControl } from "@/components/Form";
import LoadingButton from "@/components/Loading/LoadingButton";
import { Toast } from "@/hooks/Dialog";
import useInputMasks from "@/hooks/InputMasks/useInputMasks";
import PageLayout from "@/layout/PageLayout";
import { companyService } from "@/services/api/companyService";
import { clearFormDraft, readFormDraft, writeFormDraft } from "@/utils/formDraft";
import { lookupAddressByCep, sanitizeCep } from "@/utils/cepLookup";
import { isValidEmail } from "@/utils/validators";

const UF_OPTIONS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const UF_SELECT_OPTIONS = UF_OPTIONS.map((option) => ({ value: option, label: option }));

type CompanyDraft = {
  fantasyName: string;
  corporateName: string;
  cnpj: string;
  stateRegistration: string;
  website: string;
  email: string;
  telSac: string;
  telefone: string;
  celular: string;
  cep: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  uf: string;
  complement: string;
  emailSmtpEnabled: boolean;
  emailSmtpHost: string;
  emailSmtpPort: string;
  emailSmtpEnableSsl: boolean;
  emailSmtpUser: string;
  emailSmtpFromEmail: string;
  emailSmtpFromName: string;
  emailSmtpReplyTo: string;
};

function companyDraftFromApi(data: {
  fantasyName: string;
  corporateName: string;
  cnpj: string;
  stateRegistration: string;
  website: string;
  email: string;
  sacPhone: string;
  phone: string;
  mobile: string;
  cep: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  uf: string;
  complement: string;
  emailSmtpEnabled?: boolean;
  emailSmtpHost?: string;
  emailSmtpPort?: number;
  emailSmtpEnableSsl?: boolean;
  emailSmtpUser?: string;
  emailSmtpFromEmail?: string;
  emailSmtpFromName?: string;
  emailSmtpReplyTo?: string;
}): CompanyDraft {
  return {
    fantasyName: data.fantasyName,
    corporateName: data.corporateName,
    cnpj: data.cnpj,
    stateRegistration: data.stateRegistration,
    website: data.website,
    email: data.email,
    telSac: data.sacPhone,
    telefone: data.phone,
    celular: data.mobile,
    cep: data.cep,
    address: data.address,
    number: data.number,
    neighborhood: data.neighborhood,
    city: data.city,
    uf: data.uf || "SP",
    complement: data.complement,
    emailSmtpEnabled: Boolean(data.emailSmtpEnabled),
    emailSmtpHost: data.emailSmtpHost || "smtp-mail.outlook.com",
    emailSmtpPort: String(data.emailSmtpPort || 587),
    emailSmtpEnableSsl: data.emailSmtpEnableSsl ?? true,
    emailSmtpUser: data.emailSmtpUser || "",
    emailSmtpFromEmail: data.emailSmtpFromEmail || data.email || "",
    emailSmtpFromName: data.emailSmtpFromName || data.fantasyName || "PDV-Pedimais",
    emailSmtpReplyTo: data.emailSmtpReplyTo || "",
  };
}

export default function MyCompanyPage() {
  const { maskCep, maskCnpj, maskPhoneBr, onlyDigits } = useInputMasks();
  const [savedCompany] = useState(() => readFormDraft<CompanyDraft>("empresa"));
  const baselineRef = useRef<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  const [fantasyName, setFantasyName] = useState(() => savedCompany?.fantasyName ?? "");
  const [corporateName, setCorporateName] = useState(() => savedCompany?.corporateName ?? "");
  const [cnpj, setCnpj] = useState(() => savedCompany?.cnpj ?? "");
  const [stateRegistration, setStateRegistration] = useState(() => savedCompany?.stateRegistration ?? "");
  const [website, setWebsite] = useState(() => savedCompany?.website ?? "");
  const [email, setEmail] = useState(() => savedCompany?.email ?? "");
  const [telSac, setTelSac] = useState(() => savedCompany?.telSac ?? "");
  const [telefone, setTelefone] = useState(() => savedCompany?.telefone ?? "");
  const [celular, setCelular] = useState(() => savedCompany?.celular ?? "");
  const [cep, setCep] = useState(() => savedCompany?.cep ?? "");
  const [address, setAddress] = useState(() => savedCompany?.address ?? "");
  const [number, setNumber] = useState(() => savedCompany?.number ?? "");
  const [neighborhood, setNeighborhood] = useState(() => savedCompany?.neighborhood ?? "");
  const [city, setCity] = useState(() => savedCompany?.city ?? "");
  const [uf, setUf] = useState(() => savedCompany?.uf || "SP");
  const [complement, setComplement] = useState(() => savedCompany?.complement ?? "");
  const [emailSmtpEnabled, setEmailSmtpEnabled] = useState(() => savedCompany?.emailSmtpEnabled ?? false);
  const [emailSmtpHost, setEmailSmtpHost] = useState(
    () => savedCompany?.emailSmtpHost || "smtp-mail.outlook.com",
  );
  const [emailSmtpPort, setEmailSmtpPort] = useState(() => savedCompany?.emailSmtpPort || "587");
  const [emailSmtpEnableSsl, setEmailSmtpEnableSsl] = useState(() => savedCompany?.emailSmtpEnableSsl ?? true);
  const [emailSmtpUser, setEmailSmtpUser] = useState(() => savedCompany?.emailSmtpUser ?? "");
  const [emailSmtpPassword, setEmailSmtpPassword] = useState("");
  const [emailSmtpHasPassword, setEmailSmtpHasPassword] = useState(false);
  const [emailSmtpFromEmail, setEmailSmtpFromEmail] = useState(() => savedCompany?.emailSmtpFromEmail ?? "");
  const [emailSmtpFromName, setEmailSmtpFromName] = useState(
    () => savedCompany?.emailSmtpFromName || "PDV-Pedimais",
  );
  const [emailSmtpReplyTo, setEmailSmtpReplyTo] = useState(() => savedCompany?.emailSmtpReplyTo ?? "");
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [cepLookupError, setCepLookupError] = useState("");
  const [saving, setSaving] = useState(false);
  const [planExpiresAt, setPlanExpiresAt] = useState("");

  useEffect(() => {
    companyService
      .get()
      .then((data) => {
        if (!data) return;
        setPlanExpiresAt(data.planExpiresAt || "");
        const server = companyDraftFromApi(data);
        baselineRef.current = JSON.stringify(server);
        if (!savedCompany) {
          setFantasyName(server.fantasyName);
          setCorporateName(server.corporateName);
          setCnpj(server.cnpj);
          setStateRegistration(server.stateRegistration);
          setWebsite(server.website);
          setEmail(server.email);
          setTelSac(server.telSac);
          setTelefone(server.telefone);
          setCelular(server.celular);
          setCep(server.cep);
          setAddress(server.address);
          setNumber(server.number);
          setNeighborhood(server.neighborhood);
          setCity(server.city);
          setUf(server.uf);
          setComplement(server.complement);
          setEmailSmtpEnabled(server.emailSmtpEnabled);
          setEmailSmtpHost(server.emailSmtpHost);
          setEmailSmtpPort(server.emailSmtpPort);
          setEmailSmtpEnableSsl(server.emailSmtpEnableSsl);
          setEmailSmtpUser(server.emailSmtpUser);
          setEmailSmtpFromEmail(server.emailSmtpFromEmail);
          setEmailSmtpFromName(server.emailSmtpFromName);
          setEmailSmtpReplyTo(server.emailSmtpReplyTo);
        }
        setEmailSmtpPassword("");
        setEmailSmtpHasPassword(Boolean(data.emailSmtpHasPassword));
        setDraftReady(true);
      })
      .catch(() => {
        Toast.error("Não foi possível carregar dados da empresa.");
        setDraftReady(true);
      });
  }, [savedCompany]);

  useEffect(() => {
    if (!draftReady || baselineRef.current === null) return;
    const current: CompanyDraft = {
      fantasyName,
      corporateName,
      cnpj,
      stateRegistration,
      website,
      email,
      telSac,
      telefone,
      celular,
      cep,
      address,
      number,
      neighborhood,
      city,
      uf,
      complement,
      emailSmtpEnabled,
      emailSmtpHost,
      emailSmtpPort,
      emailSmtpEnableSsl,
      emailSmtpUser,
      emailSmtpFromEmail,
      emailSmtpFromName,
      emailSmtpReplyTo,
    };
    const serialized = JSON.stringify(current);
    if (serialized === baselineRef.current) {
      clearFormDraft("empresa");
      return;
    }
    writeFormDraft("empresa", current);
  }, [
    draftReady,
    fantasyName,
    corporateName,
    cnpj,
    stateRegistration,
    website,
    email,
    telSac,
    telefone,
    celular,
    cep,
    address,
    number,
    neighborhood,
    city,
    uf,
    complement,
    emailSmtpEnabled,
    emailSmtpHost,
    emailSmtpPort,
    emailSmtpEnableSsl,
    emailSmtpUser,
    emailSmtpFromEmail,
    emailSmtpFromName,
    emailSmtpReplyTo,
  ]);

  const handleCepLookup = async () => {
    const rawCep = sanitizeCep(cep);

    if (rawCep.length === 0) {
      setCepLookupError("");
      return;
    }

    if (rawCep.length !== 8) {
      setCepLookupError("CEP inválido. Informe 8 dígitos.");
      return;
    }

    setCepLookupLoading(true);
    setCepLookupError("");

    const result = await lookupAddressByCep(rawCep);

    setCepLookupLoading(false);

    if (!result.success) {
      setCepLookupError("Verifique o CEP e tente novamente.");
      return;
    }

    setCep(maskCep(result.data.cep || rawCep));
    setAddress(result.data.endereco || "");
    setNeighborhood(result.data.bairro || "");
    setCity(result.data.cidade || "");
    if (result.data.estado) setUf(result.data.estado);
    setComplement(result.data.complemento || "");
  };

  const saveCompany = async () => {
    if (fantasyName.trim().length < 3) {
      Toast.error("Informe o nome fantasia.");
      return;
    }

    if (onlyDigits(cnpj).length !== 14) {
      Toast.error("CNPJ inválido.");
      return;
    }

    if (emailSmtpEnabled) {
      const smtpPort = Number(emailSmtpPort);

      if (!emailSmtpHost.trim()) {
        Toast.error("Informe o host SMTP.");
        return;
      }

      if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
        Toast.error("Informe uma porta SMTP válida.");
        return;
      }

      if (!isValidEmail(emailSmtpUser)) {
        Toast.error("Informe o usuário SMTP.");
        return;
      }

      if (!isValidEmail(emailSmtpFromEmail)) {
        Toast.error("Informe o e-mail remetente.");
        return;
      }

      if (emailSmtpReplyTo.trim() && !isValidEmail(emailSmtpReplyTo)) {
        Toast.error("Informe um e-mail de resposta válido.");
        return;
      }

      if (!emailSmtpHasPassword && !emailSmtpPassword.trim()) {
        Toast.error("Informe a senha de app SMTP.");
        return;
      }
    }

    setSaving(true);
    try {
      const data = await companyService.update({
        fantasyName,
        corporateName,
        cnpj,
        stateRegistration,
        website,
        email,
        sacPhone: telSac,
        phone: telefone,
        mobile: celular,
        cep,
        address,
        number,
        neighborhood,
        city,
        uf,
        complement,
        emailSmtpEnabled,
        emailSmtpHost,
        emailSmtpPort: Number(emailSmtpPort || 0),
        emailSmtpEnableSsl,
        emailSmtpUser,
        emailSmtpPassword,
        emailSmtpHasPassword,
        emailSmtpFromEmail,
        emailSmtpFromName,
        emailSmtpReplyTo,
      });

      if (data) {
        const server = companyDraftFromApi(data);
        baselineRef.current = JSON.stringify(server);
        clearFormDraft("empresa");
        setFantasyName(data.fantasyName);
        setCorporateName(data.corporateName);
        setCnpj(data.cnpj);
        setStateRegistration(data.stateRegistration);
        setWebsite(data.website);
        setEmail(data.email);
        setTelSac(data.sacPhone);
        setTelefone(data.phone);
        setCelular(data.mobile);
        setCep(data.cep);
        setAddress(data.address);
        setNumber(data.number);
        setNeighborhood(data.neighborhood);
        setCity(data.city);
        setUf(data.uf || "SP");
        setComplement(data.complement);
        setEmailSmtpEnabled(Boolean(data.emailSmtpEnabled));
        setEmailSmtpHost(data.emailSmtpHost || "smtp-mail.outlook.com");
        setEmailSmtpPort(String(data.emailSmtpPort || 587));
        setEmailSmtpEnableSsl(data.emailSmtpEnableSsl ?? true);
        setEmailSmtpUser(data.emailSmtpUser || "");
        setEmailSmtpPassword("");
        setEmailSmtpHasPassword(Boolean(data.emailSmtpHasPassword));
        setEmailSmtpFromEmail(data.emailSmtpFromEmail || data.email || "");
        setEmailSmtpFromName(data.emailSmtpFromName || data.fantasyName || "PDV-Pedimais");
        setEmailSmtpReplyTo(data.emailSmtpReplyTo || "");
      }
      Toast.success("Dados da empresa salvos com sucesso.");
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Erro ao salvar dados da empresa.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout className="space-y-4 py-4 md:py-6 lg:py-8">
      <PageHeader
        title="Minha Empresa"
        description="Dados cadastrais e de contato da empresa."
      />

      {planExpiresAt ? (
        <p className="text-sm text-text-secondary">
          O plano dura 30 dias após a compra. Válido até{" "}
          {new Date(planExpiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
          Depois disso o caixa bloqueia.
        </p>
      ) : null}

      <section className="card rounded-2xl p-4 md:p-5">
        <form className="grid gap-4 md:grid-cols-12">
          <label className="block md:col-span-6">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Nome Fantasia
            </span>
            <input
              className="input-field w-full"
              value={fantasyName}
              onChange={(event) => setFantasyName(event.target.value)}
              placeholder="Nome fantasia"
            />
          </label>

          <label className="block md:col-span-6">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Razão Social
            </span>
            <input
              className="input-field w-full"
              value={corporateName}
              onChange={(event) => setCorporateName(event.target.value)}
              placeholder="Razão social"
            />
          </label>

          <label className="block md:col-span-6">
            <span className="mb-1.5 block text-sm text-text-secondary">
              CNPJ
            </span>
            <input
              className="input-field w-full"
              value={cnpj}
              onChange={(event) => setCnpj(maskCnpj(event.target.value))}
              placeholder="00.000.000/0000-00"
            />
          </label>

          <label className="block md:col-span-6">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Inscrição Estadual
            </span>
            <input
              className="input-field w-full"
              value={stateRegistration}
              onChange={(event) => setStateRegistration(event.target.value)}
              placeholder="Inscrição estadual"
            />
          </label>

          <label className="block md:col-span-6">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Site
            </span>
            <input
              className="input-field w-full"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://www.seusite.com.br"
            />
          </label>

          <label className="block md:col-span-6">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Email de Contato
            </span>
            <input
              className="input-field w-full"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@empresa.com.br"
            />
          </label>

          <label className="block md:col-span-4">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Tel SAC
            </span>
            <input
              className="input-field w-full"
              value={telSac}
              onChange={(event) => setTelSac(maskPhoneBr(event.target.value))}
              placeholder="(00) 00000-0000"
            />
          </label>

          <label className="block md:col-span-4">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Telefone
            </span>
            <input
              className="input-field w-full"
              value={telefone}
              onChange={(event) => setTelefone(maskPhoneBr(event.target.value))}
              placeholder="(00) 00000-0000"
            />
          </label>

          <label className="block md:col-span-4">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Celular
            </span>
            <input
              className="input-field w-full"
              value={celular}
              onChange={(event) => setCelular(maskPhoneBr(event.target.value))}
              placeholder="(00) 00000-0000"
            />
          </label>

          <label className="block md:col-span-3">
            <span className="mb-1.5 block text-sm text-text-secondary">
              CEP
            </span>
            <input
              className="input-field w-full"
              value={cep}
              onChange={(event) => setCep(maskCep(event.target.value))}
              onBlur={handleCepLookup}
              placeholder="00000-000"
            />
            {cepLookupLoading ? (
              <p className="mt-1 text-xs text-text-secondary">Consultando CEP...</p>
            ) : null}
            {cepLookupError ? (
              <p className="mt-1 text-xs text-primary">{cepLookupError}</p>
            ) : null}
          </label>

          <label className="block md:col-span-6">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Endereço
            </span>
            <input
              className="input-field w-full"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Rua, avenida, alameda..."
            />
          </label>

          <label className="block md:col-span-3">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Número
            </span>
            <input
              className="input-field w-full"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder="Número"
            />
          </label>

          <label className="block md:col-span-3">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Bairro
            </span>
            <input
              className="input-field w-full"
              value={neighborhood}
              onChange={(event) => setNeighborhood(event.target.value)}
              placeholder="Bairro"
            />
          </label>

          <label className="block md:col-span-4">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Cidade
            </span>
            <input
              className="input-field w-full"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Cidade"
            />
          </label>

          <SearchableSelectField
            label="UF"
            value={uf}
            options={UF_SELECT_OPTIONS}
            onChange={(nextValue) => setUf(nextValue)}
            getOptionValue={(option) => option.value}
            getOptionLabel={(option) => option.label}
            placeholder="UF"
            emptyMessage="UF não encontrada."
            className="md:col-span-2"
          />

          <label className="block md:col-span-3">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Complemento
            </span>
            <input
              className="input-field w-full"
              value={complement}
              onChange={(event) => setComplement(event.target.value)}
              placeholder="Apto, bloco..."
            />
          </label>

          <div className="flex justify-end md:col-span-12">
            <LoadingButton
              type="button"
              onClick={saveCompany}
              isLoading={saving}
              loadingLabel="Salvando..."
              className="btn-primary"
            >
              Salvar dados da empresa
            </LoadingButton>
          </div>
        </form>
      </section>

      <section data-tour="empresa-email" className="card rounded-2xl p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              Configuração de e-mail
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Envio de e-mails do sistema usando a conta da empresa.
            </p>
          </div>

          <YesNoSegmentedControl
            value={emailSmtpEnabled}
            onChange={setEmailSmtpEnabled}
            ariaLabel="Usar envio de e-mails pela conta da empresa"
          />
        </div>

        <form className="grid gap-4 md:grid-cols-12">
          <label className="block md:col-span-6">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Host SMTP
            </span>
            <input
              className="input-field w-full"
              value={emailSmtpHost}
              onChange={(event) => setEmailSmtpHost(event.target.value)}
              placeholder="smtp-mail.outlook.com"
              disabled={!emailSmtpEnabled}
            />
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Porta
            </span>
            <input
              className="input-field w-full"
              inputMode="numeric"
              value={emailSmtpPort}
              onChange={(event) =>
                setEmailSmtpPort(event.target.value.replace(/\D/g, "").slice(0, 5))
              }
              placeholder="587"
              disabled={!emailSmtpEnabled}
            />
          </label>

          <label className="flex items-end md:col-span-4">
            <span className="inline-flex min-h-11 items-center gap-3 text-sm font-medium text-text-primary">
              <input
                type="checkbox"
                checked={emailSmtpEnableSsl}
                onChange={(event) => setEmailSmtpEnableSsl(event.target.checked)}
                disabled={!emailSmtpEnabled}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              Conexão segura
            </span>
          </label>

          <label className="block md:col-span-6">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Usuário SMTP
            </span>
            <input
              className="input-field w-full"
              value={emailSmtpUser}
              onChange={(event) => setEmailSmtpUser(event.target.value)}
              placeholder="email@empresa.com.br"
              disabled={!emailSmtpEnabled}
            />
          </label>

          <label className="block md:col-span-6">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Senha de app
            </span>
            <input
              className="input-field w-full"
              type="password"
              value={emailSmtpPassword}
              onChange={(event) => setEmailSmtpPassword(event.target.value)}
              placeholder={
                emailSmtpHasPassword
                  ? "Senha já configurada. Preencha apenas para trocar."
                  : "Senha de app SMTP"
              }
              disabled={!emailSmtpEnabled}
            />
          </label>

          <label className="block md:col-span-4">
            <span className="mb-1.5 block text-sm text-text-secondary">
              E-mail remetente
            </span>
            <input
              className="input-field w-full"
              value={emailSmtpFromEmail}
              onChange={(event) => setEmailSmtpFromEmail(event.target.value)}
              placeholder="naoresponder@empresa.com.br"
              disabled={!emailSmtpEnabled}
            />
          </label>

          <label className="block md:col-span-4">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Nome do remetente
            </span>
            <input
              className="input-field w-full"
              value={emailSmtpFromName}
              onChange={(event) => setEmailSmtpFromName(event.target.value)}
              placeholder="Nome da empresa"
              disabled={!emailSmtpEnabled}
            />
          </label>

          <label className="block md:col-span-4">
            <span className="mb-1.5 block text-sm text-text-secondary">
              Responder para
            </span>
            <input
              className="input-field w-full"
              value={emailSmtpReplyTo}
              onChange={(event) => setEmailSmtpReplyTo(event.target.value)}
              placeholder="resposta@empresa.com.br"
              disabled={!emailSmtpEnabled}
            />
          </label>

          <div className="flex justify-end md:col-span-12">
            <LoadingButton
              type="button"
              onClick={saveCompany}
              isLoading={saving}
              loadingLabel="Salvando..."
              className="btn-primary"
            >
              Salvar configuração de e-mail
            </LoadingButton>
          </div>
        </form>
      </section>
    </PageLayout>
  );
}
