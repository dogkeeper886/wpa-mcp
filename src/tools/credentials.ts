import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { credentialStore } from "../lib/credential-store.js";

export function registerCredentialTools(server: McpServer): void {
  // credential_store - Create or update a stored credential
  server.tool(
    "credential_store",
    "Store EAP-TLS certificates for enterprise WiFi authentication. " +
      "Workflow: (1) Upload cert files to MCP server, (2) Call this tool with file paths, " +
      "(3) Use wifi_connect_tls with returned credential_id. " +
      "ID is auto-generated from certificate fingerprint. Identity is auto-extracted from certificate CN.",
    {
      client_cert_path: z.string().describe("Absolute path to client certificate in PEM format"),
      private_key_path: z.string().describe("Absolute path to private key in PEM format"),
      ca_cert_path: z
        .string()
        .optional()
        .describe("Absolute path to CA certificate in PEM format"),
      private_key_password: z
        .string()
        .optional()
        .describe("Passphrase for encrypted private key"),
      description: z
        .string()
        .optional()
        .describe("Human-readable description of this credential"),
    },
    async ({
      client_cert_path,
      private_key_path,
      ca_cert_path,
      private_key_password,
      description,
    }) => {
      try {
        const result = await credentialStore.storeFromPaths(
          client_cert_path,
          private_key_path,
          ca_cert_path,
          private_key_password,
          description
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  id: result.id,
                  identity: result.identity,
                  created: result.created,
                  updated: !result.created,
                  path: result.path,
                  message: result.created
                    ? `Credential '${result.id}' created successfully`
                    : `Credential '${result.id}' updated successfully`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // credential_get - Get credential metadata and optionally PEM content
  server.tool(
    "credential_get",
    "Get details of a stored credential. Returns metadata (identity, dates, cert info). " +
      "Use include_certs=true to also return PEM content.",
    {
      id: z.string().describe("Credential identifier"),
      include_certs: z
        .boolean()
        .optional()
        .describe("Include PEM certificate content in response (default: false)"),
    },
    async ({ id, include_certs }) => {
      try {
        const credential = await credentialStore.get(id);

        if (!credential) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: `Credential '${id}' not found`,
                }),
              },
            ],
            isError: true,
          };
        }

        const certInfo = await credentialStore.getCertInfo(id);

        const response: Record<string, unknown> = {
          success: true,
          id: credential.metadata.id,
          identity: credential.metadata.identity,
          description: credential.metadata.description,
          created_at: credential.metadata.created_at,
          updated_at: credential.metadata.updated_at,
          has_ca_cert: credential.metadata.has_ca_cert,
          has_key_password: credential.metadata.has_key_password,
          cert_info: certInfo,
        };

        if (include_certs) {
          const pemContent = await credentialStore.getPemContent(id);
          if (pemContent) {
            response.client_cert_pem = pemContent.client_cert_pem;
            response.private_key_pem = pemContent.private_key_pem;
            if (pemContent.ca_cert_pem) {
              response.ca_cert_pem = pemContent.ca_cert_pem;
            }
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // credential_list - List all stored credentials
  server.tool(
    "credential_list",
    "List all stored EAP-TLS credentials. Returns metadata for each credential " +
      "(id, identity, description, dates). Use credential_get for full details.",
    {},
    async () => {
      try {
        const credentials = await credentialStore.list();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  credentials: credentials.map((c) => ({
                    id: c.id,
                    identity: c.identity,
                    description: c.description,
                    created_at: c.created_at,
                    updated_at: c.updated_at,
                    has_ca_cert: c.has_ca_cert,
                  })),
                  count: credentials.length,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // credential_delete - Delete a stored credential
  server.tool(
    "credential_delete",
    "Delete a stored credential. Removes all certificate files and metadata. " +
      "This action cannot be undone.",
    {
      id: z.string().describe("Credential identifier to delete"),
    },
    async ({ id }) => {
      try {
        const exists = await credentialStore.exists(id);

        if (!exists) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: `Credential '${id}' not found`,
                }),
              },
            ],
            isError: true,
          };
        }

        const deleted = await credentialStore.delete(id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: deleted,
                id,
                deleted,
                message: deleted
                  ? `Credential '${id}' deleted successfully`
                  : `Failed to delete credential '${id}'`,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
