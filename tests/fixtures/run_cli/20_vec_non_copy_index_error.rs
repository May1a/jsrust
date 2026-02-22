struct S {
    x: i32,
}

fn main() {
    let v = vec![S { x: 1 }];
    let x = match v[0] {
        Option::None => 0,
        _ => 1,
    };
    println!("{}", x);
}
