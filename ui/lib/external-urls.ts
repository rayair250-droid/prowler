import type { IntegrationType } from "../types/integrations";

// Documentation URLs
export const DOCS_URLS = {
  FINDINGS_ANALYSIS:
    "https://docs.prowler.com/user-guide/tutorials/prowler-app#step-8:-analyze-the-findings",
  FINDINGS_INGESTION:
    "https://docs.prowler.com/user-guide/tutorials/prowler-app-import-findings",
  FINDINGS_TRIAGE:
    "https://docs.prowler.com/user-guide/tutorials/prowler-app-findings-triage",
  AWS_ORGANIZATIONS:
    "https://docs.prowler.com/user-guide/tutorials/prowler-cloud-aws-organizations",
  ALERTS: "https://docs.prowler.com/user-guide/tutorials/prowler-app-alerts",
  SCAN_CONFIGURATION:
    "https://docs.prowler.com/user-guide/tutorials/prowler-app-scan-configuration",
  ATTACK_PATHS_CUSTOM_QUERIES:
    "https://docs.prowler.com/user-guide/tutorials/prowler-app-attack-paths#writing-custom-opencypher-queries",
  AI_AGENTS: "https://docs.prowler.com/user-guide/ai-agents/",
} as const;

// CloudFormation template URL for the ProwlerScan role.
// Also used (URL-encoded) as the templateURL param in the quick-create links
// built by getAWSCredentialsTemplateLinks and getAWSOrgDeploymentQuickLink below.
export const PROWLER_CF_TEMPLATE_URL =
  "https://prowler-cloud-public.s3.eu-west-1.amazonaws.com/permissions/templates/aws/cloudformation/prowler-scan-role.yml";

// Prowler Cloud billing/subscription management page.
export const BILLING_URL = "https://cloud.prowler.com/billing";

// Base URL for the CloudFormation "quick create stack" console flow.
// Hardcoded to us-east-1 because the public template is hosted for that flow.
const CF_QUICKCREATE_BASE_URL =
  "https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate";

export interface AWSOrgDeploymentQuickLinkParams {
  externalId: string;
  organizationalUnitId: string;
  deployFromDelegatedAdmin?: boolean;
}

const buildCloudFormationQuickCreateLink = (
  parameters: Record<string, string>,
): string => {
  const searchParams = new URLSearchParams({
    templateURL: PROWLER_CF_TEMPLATE_URL,
    stackName: "Prowler",
    ...parameters,
  });

  return `${CF_QUICKCREATE_BASE_URL}?${searchParams.toString()}`;
};

// Deep-links to each provider's onboarding docs section. Kept as direct
// docs.prowler.com URLs (rather than goto.prowler.com shortlinks) so the
// destination is visible at review time and there is no hidden redirect hop.
export const getProviderHelpText = (provider: string) => {
  switch (provider) {
    case "aws":
      return {
        text: "Need help connecting your AWS account?",
        link: "https://docs.prowler.com/user-guide/providers/aws/getting-started-aws",
      };
    case "azure":
      return {
        text: "Need help connecting your Azure subscription?",
        link: "https://docs.prowler.com/user-guide/providers/azure/getting-started-azure",
      };
    case "m365":
      return {
        text: "Need help connecting your Microsoft 365 account?",
        link: "https://docs.prowler.com/user-guide/providers/microsoft365/getting-started-m365",
      };
    case "gcp":
      return {
        text: "Need help connecting your GCP project?",
        link: "https://docs.prowler.com/user-guide/providers/gcp/getting-started-gcp",
      };
    case "kubernetes":
      return {
        text: "Need help connecting your Kubernetes cluster?",
        link: "https://docs.prowler.com/user-guide/providers/kubernetes/getting-started-k8s",
      };
    case "github":
      return {
        text: "Need help connecting your GitHub account?",
        link: "https://docs.prowler.com/user-guide/providers/github/getting-started-github",
      };
    case "iac":
      return {
        text: "Need help scanning your Infrastructure as Code repository?",
        link: "https://docs.prowler.com/user-guide/providers/iac/getting-started-iac",
      };
    case "image":
      return {
        text: "Need help scanning your container registry?",
        link: "https://docs.prowler.com/user-guide/providers/image/getting-started-image",
      };
    case "oraclecloud":
      return {
        text: "Need help connecting your Oracle Cloud account?",
        link: "https://docs.prowler.com/user-guide/providers/oci/getting-started-oci",
      };
    case "mongodbatlas":
      return {
        text: "Need help connecting your MongoDB Atlas organization?",
        link: "https://docs.prowler.com/user-guide/providers/mongodbatlas/getting-started-mongodbatlas",
      };
    case "alibabacloud":
      return {
        text: "Need help connecting your Alibaba Cloud account?",
        link: "https://docs.prowler.com/user-guide/providers/alibabacloud/getting-started-alibabacloud",
      };
    case "cloudflare":
      return {
        text: "Need help connecting your Cloudflare account?",
        link: "https://docs.prowler.com/user-guide/providers/cloudflare/getting-started-cloudflare",
      };
    case "openstack":
      return {
        text: "Need help connecting your OpenStack cloud?",
        link: "https://docs.prowler.com/user-guide/providers/openstack/getting-started-openstack",
      };
    case "googleworkspace":
      return {
        text: "Need help connecting your Google Workspace account?",
        link: "https://docs.prowler.com/user-guide/providers/googleworkspace/getting-started-googleworkspace",
      };
    case "vercel":
      return {
        text: "Need help connecting your Vercel team?",
        link: "https://docs.prowler.com/user-guide/providers/vercel/getting-started-vercel",
      };
    case "okta":
      return {
        text: "Need help connecting your Okta organization?",
        link: "https://docs.prowler.com/user-guide/providers/okta/getting-started-okta",
      };
    default:
      return {
        text: "How to setup a provider?",
        link: "https://docs.prowler.com/user-guide/providers/",
      };
  }
};

export const getAWSCredentialsTemplateLinks = (
  externalId: string,
  bucketName?: string,
  integrationType?: IntegrationType,
  bucketAccountId?: string,
): {
  cloudformation: string;
  terraform: string;
  cloudformationQuickLink: string;
} => {
  let links = {};

  if (integrationType === undefined || integrationType === "aws_security_hub") {
    links = {
      cloudformation:
        "https://github.com/prowler-cloud/prowler/blob/master/permissions/templates/cloudformation/prowler-scan-role.yml",
      terraform:
        "https://github.com/prowler-cloud/prowler/tree/master/permissions/templates/terraform",
    };
  }

  if (integrationType === "amazon_s3") {
    links = {
      cloudformation:
        "https://docs.prowler.com/projects/prowler-open-source/en/latest/tutorials/prowler-app-s3-integration/",
      terraform:
        "https://docs.prowler.com/projects/prowler-open-source/en/latest/tutorials/prowler-app-s3-integration/#terraform",
    };
  }

  // The template requires S3IntegrationBucketAccountId (owner account of the
  // bucket) whenever EnableS3Integration is true. Only enable S3 when both the
  // bucket name and its account id are known, otherwise an incomplete link
  // would fail stack validation on the quick-create flow (reachable from the
  // edit-credentials flow, where the account id can resolve to an empty value).
  const parameters: Record<string, string> = {
    param_ExternalId: externalId,
  };

  if (bucketName && bucketAccountId) {
    parameters.param_EnableS3Integration = "true";
    parameters.param_S3IntegrationBucketName = bucketName;
    parameters.param_S3IntegrationBucketAccountId = bucketAccountId;
  }

  return {
    ...(links as {
      cloudformation: string;
      terraform: string;
    }),
    cloudformationQuickLink: buildCloudFormationQuickCreateLink(parameters),
  };
};

// Builds the CloudFormation quick-create link that onboards an entire AWS
// Organization in a single stack: it creates the ProwlerScan role in the
// account launching the stack (DeployLocalRole) and a service-managed StackSet
// that rolls the role out to the member accounts under the given OU/root
// (DeployStackSet). By default the stack is launched from the management
// account; set deployFromDelegatedAdmin when launching from a delegated
// administrator account instead, where the local role lands in that account.
export const getAWSOrgDeploymentQuickLink = ({
  externalId,
  organizationalUnitId,
  deployFromDelegatedAdmin = false,
}: AWSOrgDeploymentQuickLinkParams): string => {
  const parameters: Record<string, string> = {
    param_ExternalId: externalId,
    param_EnableOrganizations: "true",
    param_DeployLocalRole: "true",
    param_DeployStackSet: "true",
    param_AWSOrganizationalUnitId: organizationalUnitId,
  };

  if (deployFromDelegatedAdmin) {
    parameters.param_DeployFromDelegatedAdmin = "true";
  }

  return buildCloudFormationQuickCreateLink(parameters);
};
