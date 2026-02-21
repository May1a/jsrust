fn main() {
    let v = vec![1, 2, 3];
    println!("{}", v.len());
    println!("{}", v.capacity());

    v.push(4);
    println!("{}", v.len());
    println!("{}", v.capacity());

    println!("{}", v.get(2));
    println!("{}", v[1]);

    println!("{}", v.pop());
    println!("{}", v.len());
}
