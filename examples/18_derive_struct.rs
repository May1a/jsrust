#[derive(Clone, Copy, Debug)]
struct Pair {
    a: i32,
    b: i32,
}

#[test]
fn test_example() {
    let p = Pair { a: 4, b: 5 };
    let q = p.clone();
    println!("{} {}", q.a, q.b);
}
