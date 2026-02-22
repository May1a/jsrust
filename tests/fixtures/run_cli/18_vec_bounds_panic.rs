fn main() {
    let v = vec![1, 2, 3];
    let out = match v[4] {
        Option::None => -1,
        _ => 0,
    };
    println!("{}", out);
}
