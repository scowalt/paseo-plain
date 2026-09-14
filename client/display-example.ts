// Static display fixture only. No model work or saved preferences are involved.
const details = '\n\n| Direction | Why it fits | Trade-off |\n|:---|:---:|---:|\n| **North** | Walkable streets, parks, and museums | Cooler weather |\n| South | A longer description that wraps inside its own column on a small screen | Higher cost |\n\nRead the [**Paseo guide**](https://paseo.sh/docs.md).\n\n```sh\nnpm test\n```';
export const displayExample = {
  original: `The operation completed.${details}`,
  rewritten: `It worked.${details}`,
};
