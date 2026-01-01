
'use server';

/**
 * @fileOverview Generates a secure, time-based QR code for employee attendance.
 *
 * - generateSecureQrCode - A function that generates the QR code.
 * - GenerateSecureQrCodeInput - The input type for the generateSecureQrCode function.
 * - GenerateSecureQrCodeOutput - The return type for the generateSecureQrCode function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import qr from 'qr-image';


const GenerateSecureQrCodeInputSchema = z.object({
  currentDate: z.string().describe('The current date in ISO format.'),
  uniqueToken: z.string().describe('A unique token or random salt.'),
  serverSecret: z.string().describe('A server-side secret for signing the QR code.'),
  qrCodeRefreshInterval: z.number().describe('The QR code refresh interval in seconds.'),
  locationCoordinates: z.object({
    latitude: z.number().describe('The latitude of the location.'),
    longitude: z.number().describe('The longitude of the location.'),
  }).describe('The location coordinates where the QR code is active.'),
});
export type GenerateSecureQrCodeInput = z.infer<typeof GenerateSecureQrCodeInputSchema>;

const GenerateSecureQrCodeOutputSchema = z.object({
  qrCodeDataUri: z.string().describe('The QR code as a data URI.'),
  expiryTimestamp: z.number().describe('The expiry timestamp of the QR code.'),
});
export type GenerateSecureQrCodeOutput = z.infer<typeof GenerateSecureQrCodeOutputSchema>;

export async function generateSecureQrCode(input: GenerateSecureQrCodeInput): Promise<GenerateSecureQrCodeOutput> {
  return generateSecureQrCodeFlow(input);
}

const generateSecureQrCodeFlow = ai.defineFlow(
  {
    name: 'generateSecureQrCodeFlow',
    inputSchema: GenerateSecureQrCodeInputSchema,
    outputSchema: GenerateSecureQrCodeOutputSchema,
  },
  async input => {
    const expiryTimestamp = Date.now() + input.qrCodeRefreshInterval * 1000;
    const qrCodeContent = JSON.stringify({
      date: input.currentDate,
      token: input.uniqueToken,
      location: input.locationCoordinates,
      expiry: expiryTimestamp,
      signature: btoa(input.currentDate + input.uniqueToken + input.serverSecret), // Simple example, use a proper signing method
    });

    const svgString = qr.imageSync(qrCodeContent, { type: 'svg' });
    const qrCodeDataUri = `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`;

    return {
      qrCodeDataUri: qrCodeDataUri,
      expiryTimestamp: expiryTimestamp,
    };
  }
);

    