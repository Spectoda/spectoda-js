declare module "@spectoda/spectoda-js" {
  export function createNanoEvents(): any;
  export function setLoggingLevel(...props: any[]): any;
  export class Spectoda {
    constructor(...props: any[]);
    assignConnector(...props: any[]): any;
    assignOwnerKey(...props: any[]): any;
    assignOwnerSignature(...props: any[]): any;
  }
}
