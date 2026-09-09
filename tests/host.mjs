// Only the external Paseo host is substituted. Plugin components and Query run normally.
export const useRpc = (contract) => (input) => globalThis.plainTestHost.rpc(contract.name, input);
export const useAgent = (_id, selector) => selector({ status: globalThis.plainTestHost.status });
export const usePaseo = () => globalThis.plainTestHost.paseo;
export const copyText = async (text) => { globalThis.plainTestHost.copied = text; };
