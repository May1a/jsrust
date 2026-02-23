fn main() {
    let v = vec![1, 2, 3];
    println!("{}", v.len());
    println!("{}", v.capacity());

    v.push(4);
    println!("{}", v.len());
    println!("{}", v.capacity());

    let got = match v.get(2) {
        Option::None => -1,
        _ => 3,
    };
    println!("{}", got);

    let indexed = v[1];
    println!("{}", indexed);

    let popped = match v.pop() {
        Option::None => -1,
        _ => 4,
    };
    println!("{}", popped);
    println!("{}", v.len());
}
