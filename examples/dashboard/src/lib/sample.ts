// Inlined at build time, so loading the demo needs no network request and no
// awareness of the deployment's base path. The fixture is synthetic — every
// figure, date, ISIN and order id in it is fabricated.
import sampleCsv from '../../../../test/fixtures/Account.csv?raw';

export { sampleCsv };

export const SAMPLE_FILE_NAME = 'Account.csv (sample)';
