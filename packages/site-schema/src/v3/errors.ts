export class EditV3Error extends Error {
  constructor(m: string) {
    super(m);
    this.name = "EditV3Error";
  }
}
