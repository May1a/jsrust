fn main() {
    let mut x = 10;
    let r1 = &x;
    let r2 = &mut x;
    let y = *r1;
}
