/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Who publishes Cognify IDE (Sprint 6): the Windows installer's publisher (Settings > Apps) and
// links, and the company and copyright in the version information of Cognify.exe and of the
// native modules it ships. Upstream's build files hard-code Microsoft's values; they read these
// instead (each use is marked Cognify).

/** The publisher shown by Windows and in file properties. */
export const PUBLISHER = 'Theoretical Minds Technology';

/** The copyright in file properties. Cognify IDE is built on Code - OSS (MIT License). */
export const COPYRIGHT = `Copyright (C) ${new Date().getFullYear()} ${PUBLISHER}. Portions Copyright (C) Microsoft Corporation.`;

/** The installer's publisher, support and updates links. */
export const PUBLISHER_URL = 'https://github.com/devartblake/cognify_ide';
